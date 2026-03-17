import { ContextConfig } from "./contextDoc";

function escapeHTML(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function markdownToHTML(md: string): string {
  // Split into blocks on double newlines, process each block separately
  // to avoid nesting block elements inside <p> (invalid XHTML)
  const blocks = md.split(/\n\n+/);
  const htmlBlocks: string[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    // Check if this block is a heading
    const h2Match = trimmed.match(/^## (.+)$/);
    const h3Match = trimmed.match(/^### (.+)$/);

    if (h3Match) {
      htmlBlocks.push(`<h3>${escapeHTML(h3Match[1])}</h3>`);
    } else if (h2Match) {
      if (h2Match[1].includes("⚑ Highlighted Findings")) {
        htmlBlocks.push(
          `<h2 style="color:#c0392b">${escapeHTML(h2Match[1])}</h2>`,
        );
      } else {
        htmlBlocks.push(`<h2>${escapeHTML(h2Match[1])}</h2>`);
      }
    } else {
      // Regular paragraph — apply inline formatting
      let text = escapeHTML(trimmed)
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/\n/g, "<br/>");
      htmlBlocks.push(`<p>${text}</p>`);
    }
  }

  return htmlBlocks.join("");
}

function findSummaryNote(
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

export function getExistingSummary(parentItem: Zotero.Item): string {
  const note = findSummaryNote(parentItem, "zs-summary");
  if (!note) return "";
  // Strip HTML to get plain text/markdown back
  return note
    .getNote()
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

export async function commitSummary(
  parentItem: Zotero.Item,
  workingSummary: string,
  config: ContextConfig,
): Promise<void> {
  const existing = findSummaryNote(parentItem, "zs-summary");
  const note = existing ?? new Zotero.Item("note");

  note.setNote(markdownToHTML(workingSummary));
  if (!existing) {
    note.parentID = parentItem.id;
    note.libraryID = parentItem.libraryID;
  }

  const today = new Date().toISOString().slice(0, 10);
  const tags: { tag: string; type: number }[] = [
    { tag: "zs-summary", type: 0 },
    { tag: `zs-model:${config.model}`, type: 0 },
    { tag: `zs-date:${today}`, type: 0 },
  ];

  if (workingSummary.includes("⚑ Highlighted Findings")) {
    tags.push({ tag: "zs-has-highlights", type: 0 });
  }

  note.setTags(tags);
  await note.saveTx();

  // Tag the parent item
  if (!parentItem.getTags().some((t: { tag: string }) => t.tag === "zs-summarized")) {
    parentItem.addTag("zs-summarized");
    await parentItem.saveTx();
  }
}

export async function writeErrorNote(
  parentItem: Zotero.Item,
  error: string,
): Promise<void> {
  const existing = findSummaryNote(parentItem, "zs-error");
  const note = existing ?? new Zotero.Item("note");

  const timestamp = new Date().toISOString();
  note.setNote(
    `<p><strong>zoTLDR Error</strong> (${timestamp})</p><p>${error.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`,
  );
  if (!existing) {
    note.parentID = parentItem.id;
    note.libraryID = parentItem.libraryID;
  }
  note.setTags([{ tag: "zs-error", type: 0 }]);
  await note.saveTx();
}
