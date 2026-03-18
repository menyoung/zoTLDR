import { config } from "../../package.json";
import { ContextConfig, loadContextDoc } from "./contextDoc";
import { callLLM } from "./llm";
import { writeErrorNote } from "./noteWriter";
import { ChatMessage, getSession } from "./sessionState";

const FORMAT_RULES = `
FORMAT RULES (strict):
- Do NOT repeat the title, authors, year, or journal — the reader already has this metadata.
- Start with a 1-2 sentence "Bottom line" stating the main finding or contribution.
- Use only ## and ### headings. Keep to 3-5 sections max.
- Keep the total summary under 300 words. Be dense, not exhaustive.
- Use plain text for units and formulas (e.g. "C2H2", "10 um", "La"). No LaTeX, no dollar signs.
- Do NOT use bullet lists with * or -. Write in short paragraphs instead.
- Bold key terms or values with **double asterisks**.
- When responding to follow-up messages, always return the complete updated summary text, incorporating the requested changes.`;

function truncateText(text: string, charBudget: number): string {
  if (text.length <= charBudget) return text;

  const headSize = Math.floor(charBudget * 0.6);
  const tailSize = Math.floor(charBudget * 0.4);
  const head = text.slice(0, headSize);
  const tail = text.slice(-tailSize);

  return `${head}\n\n[... middle sections truncated ...]\n\n${tail}`;
}

async function getFullText(
  item: Zotero.Item,
): Promise<{ text: string; totalPages: number } | null> {
  if (!item.isRegularItem()) return null;
  const attachment = await item.getBestAttachment();
  if (!attachment) return null;

  try {
    return await Zotero.PDFWorker.getFullText(attachment.id, { maxPages: 50 });
  } catch {
    return null;
  }
}

function buildSummarizePrompt(
  contextConfig: ContextConfig,
  item: Zotero.Item,
  fullText: string,
): { systemPrompt: string; messages: ChatMessage[] } {
  const highlights = Zotero.Prefs.get(
    `${config.prefsPrefix}.highlights`,
    true,
  ) as string;

  let systemPrompt = contextConfig.systemPrompt;

  systemPrompt += FORMAT_RULES;

  if (highlights?.trim()) {
    systemPrompt += `\n\nThe scientist reviewing this paper has specifically asked you to flag:\n${highlights.trim()}\n\nIf the paper contains anything directly relevant to the above, include a "## ⚑ Highlighted Findings" section. Omit this section entirely if nothing is relevant — do not pad.`;
  }

  const charBudget = contextConfig.maxTokens * 3;
  const truncated = truncateText(fullText, charBudget);

  const creators = item.getCreators();
  const authors = creators
    .map(
      (c: { firstName?: string; lastName?: string }) =>
        `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim(),
    )
    .join(", ");

  const userMessage = `Summarize the following paper.

Title: ${item.getField("title")}
Authors: ${authors}
Year: ${item.getField("year")}

${truncated}`;

  return {
    systemPrompt,
    messages: [{ role: "user" as const, content: userMessage }],
  };
}

function buildChatPrompt(
  contextConfig: ContextConfig,
  itemID: number,
  newMessage: string,
): { systemPrompt: string; messages: ChatMessage[] } {
  const session = getSession(itemID);
  let systemPrompt = contextConfig.systemPrompt;
  systemPrompt += FORMAT_RULES;

  const messages: ChatMessage[] = [
    {
      role: "user" as const,
      content: `[Current working summary of the paper:]\n${session.workingSummary}`,
    },
    ...session.chatHistory,
    { role: "user" as const, content: newMessage },
  ];

  return { systemPrompt, messages };
}

export async function summarize(item: Zotero.Item): Promise<string> {
  try {
    const contextConfig = await loadContextDoc();
    const extracted = await getFullText(item);
    if (!extracted) throw new Error("NO_PDF_TEXT");

    const { systemPrompt, messages } = buildSummarizePrompt(
      contextConfig,
      item,
      extracted.text,
    );

    const response = await callLLM({
      config: contextConfig,
      systemPrompt,
      messages,
    });

    const session = getSession(item.id);
    session.workingSummary = response;
    session.chatHistory = [];
    session.isDirty = true;

    return response;
  } catch (e: any) {
    await writeErrorNote(item, e.message ?? String(e));
    throw e;
  }
}

export async function chat(
  item: Zotero.Item,
  message: string,
): Promise<string> {
  const contextConfig = await loadContextDoc();
  const session = getSession(item.id);

  const { systemPrompt, messages } = buildChatPrompt(
    contextConfig,
    item.id,
    message,
  );

  try {
    const response = await callLLM({
      config: contextConfig,
      systemPrompt,
      messages,
    });

    session.chatHistory.push(
      { role: "user", content: message },
      { role: "assistant", content: response },
    );
    session.workingSummary = response;
    session.isDirty = true;

    return response;
  } catch (e: any) {
    await writeErrorNote(item, e.message ?? String(e));
    throw e;
  }
}

