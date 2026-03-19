const ERROR_MESSAGES: Record<string, string> = {
  NO_PDF:
    "No PDF attachment found. Ensure the item has a PDF attachment.",
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

export function htmlToMarkdown(html: string): string {
  return decodeEntities(
    html
      .replace(/<h2[^>]*>/gi, "\n\n## ")
      .replace(/<\/h2>/gi, "\n\n")
      .replace(/<h3[^>]*>/gi, "\n\n### ")
      .replace(/<\/h3>/gi, "\n\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/p>\s*<p>/gi, "\n\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
