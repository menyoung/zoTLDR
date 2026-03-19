import { loadContextDoc } from "./contextDoc";
import { callLLM } from "./llm";
import { writeErrorNote } from "./noteWriter";
import { ChatMessage, getSession } from "./sessionState";

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

async function getPdfBase64(item: Zotero.Item): Promise<string | null> {
  if (!item.isRegularItem()) return null;
  const attachment = await item.getBestAttachment();
  if (!attachment) return null;

  const path = attachment.getFilePath();
  if (!path) return null;

  const bytes = await IOUtils.read(path);
  return uint8ArrayToBase64(bytes);
}

export async function chat(
  item: Zotero.Item,
  message: string,
): Promise<string> {
  try {
    const contextConfig = await loadContextDoc();
    const session = getSession(item.id);

    // Load PDF on first message
    if (!session.pdfBase64) {
      const base64 = await getPdfBase64(item);
      if (!base64) throw new Error("NO_PDF");

      session.pdfBase64 = base64;

      const creators = item.getCreators();
      const authors = creators
        .map((c: { firstName?: string; lastName?: string }) =>
          `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim(),
        )
        .join(", ");

      session.paperMetadata = `Title: ${item.getField("title")}\nAuthors: ${authors}\nYear: ${item.getField("year")}`;
    }

    const messages: ChatMessage[] = [
      { role: "user", content: session.paperMetadata },
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
      pdfBase64: session.pdfBase64,
    });

    session.chatHistory.push(
      { role: "user", content: message },
      { role: "assistant", content: response },
    );
    session.isDirty = true;

    return response;
  } catch (e: any) {
    try {
      await writeErrorNote(item, e.message ?? String(e));
    } catch {}
    throw e;
  }
}
