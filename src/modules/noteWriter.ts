import { escapeHTML, markdownToHTML } from "../utils/html";
import { ChatMessage } from "./sessionState";

function findNoteByTag(
  parentItem: Zotero.Item,
  tag: string,
): Zotero.Item | undefined {
  const noteIDs = parentItem.getNotes();
  for (const id of noteIDs) {
    const note = Zotero.Items.get(id);
    if (note.getTags().some((t: { tag: string }) => t.tag === tag)) {
      return note;
    }
  }
  return undefined;
}

export async function saveChat(
  parentItem: Zotero.Item,
  chatHistory: ChatMessage[],
  model: string,
): Promise<void> {
  const existing = findNoteByTag(parentItem, "zs-chat");
  const note = existing ?? new Zotero.Item("note");

  let html = "";
  for (const msg of chatHistory) {
    if (msg.role === "user") {
      html += `<p><strong>You:</strong> ${escapeHTML(msg.content)}</p>`;
    } else {
      html += markdownToHTML(msg.content);
    }
  }

  note.setNote(html);
  if (!existing) {
    note.parentID = parentItem.id;
    note.libraryID = parentItem.libraryID;
  }

  const today = new Date().toISOString().slice(0, 10);
  note.setTags([
    { tag: "zs-chat", type: 0 },
    { tag: `zs-model:${model}`, type: 0 },
    { tag: `zs-date:${today}`, type: 0 },
  ]);
  await note.saveTx();
}

export async function saveResponse(
  parentItem: Zotero.Item,
  content: string,
  model: string,
): Promise<void> {
  // Always create a new note (don't overwrite previous saves)
  const note = new Zotero.Item("note");
  note.setNote(markdownToHTML(content));
  note.parentID = parentItem.id;
  note.libraryID = parentItem.libraryID;

  const today = new Date().toISOString().slice(0, 10);
  note.setTags([
    { tag: "zs-note", type: 0 },
    { tag: `zs-model:${model}`, type: 0 },
    { tag: `zs-date:${today}`, type: 0 },
  ]);
  await note.saveTx();
}

export async function writeErrorNote(
  parentItem: Zotero.Item,
  error: string,
): Promise<void> {
  const existing = findNoteByTag(parentItem, "zs-error");
  const note = existing ?? new Zotero.Item("note");

  const timestamp = new Date().toISOString();
  const safeError = escapeHTML(error);
  note.setNote(
    `<p><strong>zoTLDR Error</strong> (${timestamp})</p><p>${safeError}</p>`,
  );
  if (!existing) {
    note.parentID = parentItem.id;
    note.libraryID = parentItem.libraryID;
  }
  note.setTags([{ tag: "zs-error", type: 0 }]);
  await note.saveTx();
}
