import { loadContextDoc } from "./contextDoc";
import { callLLM } from "./llm";
import { writeErrorNote } from "./noteWriter";
import { ChatMessage, getSession } from "./sessionState";

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

export async function chat(
  item: Zotero.Item,
  message: string,
): Promise<string> {
  try {
    const contextConfig = await loadContextDoc();
    const session = getSession(item.id);

    // Load paper text on first message
    if (!session.paperContext) {
      const extracted = await getFullText(item);
      if (!extracted) throw new Error("NO_PDF_TEXT");

      const charBudget = contextConfig.maxTokens * 3;
      const truncated = truncateText(extracted.text, charBudget);

      const creators = item.getCreators();
      const authors = creators
        .map((c: { firstName?: string; lastName?: string }) =>
          `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim(),
        )
        .join(", ");

      session.paperContext = `Here is the paper I'd like to discuss:\n\nTitle: ${item.getField("title")}\nAuthors: ${authors}\nYear: ${item.getField("year")}\n\n${truncated}`;
    }

    const messages: ChatMessage[] = [
      { role: "user", content: session.paperContext },
      {
        role: "assistant",
        content: "I've read the paper. What would you like to discuss?",
      },
      ...session.chatHistory,
      { role: "user", content: message },
    ];

    const response = await callLLM({
      config: contextConfig,
      systemPrompt: contextConfig.systemPrompt,
      messages,
    });

    session.chatHistory.push(
      { role: "user", content: message },
      { role: "assistant", content: response },
    );
    session.isDirty = true;

    return response;
  } catch (e: any) {
    await writeErrorNote(item, e.message ?? String(e));
    throw e;
  }
}
