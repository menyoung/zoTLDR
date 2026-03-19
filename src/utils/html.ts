const ERROR_MESSAGES: Record<string, string> = {
  NO_PDF: "No PDF attachment found. Ensure the item has a PDF attachment.",
  NO_CONTEXT_DOC:
    "Context document not configured. Go to Settings → zoTLDR and pick a context document.",
  CONTEXT_DOC_NOT_FOUND:
    "Context document not found. It may have been deleted. Reconfigure in Settings → zoTLDR.",
  NO_API_KEY:
    "API key missing from context document. Check that the frontmatter contains api_key.",
  API_ERROR: "API error. Check your API key and try again.",
};

export function humanizeError(error: string): string {
  for (const [code, msg] of Object.entries(ERROR_MESSAGES)) {
    if (error.includes(code)) return msg;
  }
  return error;
}

export function escapeHTML(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

export function stripHTML(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  );
}

export function markdownToHTML(md: string): string {
  const blocks = md.split(/\n\n+/);
  const htmlBlocks: string[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const h3Match = trimmed.match(/^### (.+?)[\s]*$/);
    const h2Match = trimmed.match(/^## (.+?)[\s]*$/);

    if (h3Match) {
      htmlBlocks.push(`<h3>${escapeHTML(h3Match[1])}</h3>`);
    } else if (h2Match) {
      htmlBlocks.push(`<h2>${escapeHTML(h2Match[1])}</h2>`);
    } else if (/^[\s]*[-*] /.test(trimmed)) {
      // Bullet list block
      const items = trimmed.split(/\n/).map((line) => {
        const content = line.replace(/^[\s]*[-*] /, "");
        return `<li>${inlineFormat(content)}</li>`;
      });
      htmlBlocks.push(`<ul>${items.join("")}</ul>`);
    } else if (/^[\s]*\d+\. /.test(trimmed)) {
      // Numbered list block
      const items = trimmed.split(/\n/).map((line) => {
        const content = line.replace(/^[\s]*\d+\. /, "");
        return `<li>${inlineFormat(content)}</li>`;
      });
      htmlBlocks.push(`<ol>${items.join("")}</ol>`);
    } else if (trimmed.startsWith("```")) {
      // Fenced code block
      const code = escapeHTML(
        trimmed.replace(/^```[^\n]*\n?/, "").replace(/\n?```$/, ""),
      );
      htmlBlocks.push(`<pre><code>${code}</code></pre>`);
    } else {
      htmlBlocks.push(`<p>${inlineFormat(trimmed)}</p>`);
    }
  }

  return htmlBlocks.join("");
}

function inlineFormat(text: string): string {
  return escapeHTML(text)
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br/>");
}
