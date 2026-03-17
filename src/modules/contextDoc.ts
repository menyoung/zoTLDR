import { config } from "../../package.json";

export interface ContextConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  systemPrompt: string;
}

function stripHTML(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function parseFrontmatter(raw: string): {
  frontmatter: Record<string, string>;
  body: string;
} {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: raw };
  }

  const frontmatter: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      frontmatter[key] = value;
    }
  }

  return { frontmatter, body: match[2] };
}

export async function loadContextDoc(): Promise<ContextConfig> {
  const prefKey = `${config.prefsPrefix}.contextDocKey`;
  const key = Zotero.Prefs.get(prefKey, true) as string;
  Zotero.log(`[zoTLDR] loadContextDoc: prefKey=${prefKey} value="${key}"`);
  if (!key) throw new Error("NO_CONTEXT_DOC");

  // Search all libraries for the context doc by key
  let doc: Zotero.Item | false = false;
  const libraries = Zotero.Libraries.getAll();
  for (const lib of libraries) {
    const found = await Zotero.Items.getByLibraryAndKeyAsync(lib.libraryID, key);
    if (found) {
      doc = found;
      break;
    }
  }

  if (!doc || doc.itemType !== "note") throw new Error("CONTEXT_DOC_NOT_FOUND");

  const raw = stripHTML(doc.getNote());
  Zotero.log(`[zoTLDR] raw context doc:\n${raw.slice(0, 300)}`);
  const { frontmatter, body } = parseFrontmatter(raw);
  Zotero.log(`[zoTLDR] parsed frontmatter keys: ${Object.keys(frontmatter).join(", ")}`);

  if (!frontmatter.api_key) throw new Error("NO_API_KEY");

  return {
    apiKey: frontmatter.api_key,
    model: frontmatter.model ?? "gemini-3-flash-preview",
    maxTokens: parseInt(frontmatter.max_tokens ?? "2000"),
    systemPrompt: body.trim(),
  };
}
