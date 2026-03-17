# zoTLDR

AI-powered paper summarization for [Zotero 7](https://www.zotero.org/) using Google Gemini. Summarize papers, refine summaries through chat, and store results as Zotero notes — all from the item pane.

Designed for research teams: a shared **context document** configures the API key, model, and domain-specific system prompt centrally, so every team member gets consistent, domain-aware summaries.

## Install

1. Download the latest `.xpi` from [Releases](https://github.com/menyoung/zoTLDR/releases)
2. In Zotero: Tools → Add-ons → gear icon → Install Add-on From File → select the `.xpi`

Requires Zotero 7.

## Setup

### 1. Create a context document

Create a **note** in your Zotero library (ideally a group library so the whole team shares it). Tag it `zs-context`. Write it in this format:

```
---
api_key: AIzaSy...
model: gemini-3-flash-preview
max_tokens: 2000
---

You are summarizing papers for a materials research team.
Focus on: deposition chemistry, reactor conditions, microstructure outcomes.
Always note sample preparation details and characterization methods used.
```

- **Frontmatter** (`api_key`, `model`, `max_tokens`) is parsed as configuration
- **Everything below the closing `---`** is sent to the LLM as the system prompt — write whatever domain context helps produce good summaries

### 2. Configure the plugin

Go to Zotero → Settings → zoTLDR.

- **My research focus** (main textarea): Describe what *you* personally care about. If a paper is relevant, the AI adds a "Highlighted Findings" section to the summary. Leave blank to skip.
- **Advanced → Context document key**: Click **"Pick from library..."** to select your `zs-context` note. The picker finds all notes tagged `zs-context` across your libraries.

## Usage

### Summarize a paper

- Select an item and click **Summarize** in the AI Summary panel (right-side item pane), or
- Right-click one or more items → **Summarize with AI**

The summary appears in the panel. It's held in memory as a working draft until you commit it.

### Refine with chat

Type a follow-up in the input box and press Enter (or click Send). Examples:

- "Expand the methods section"
- "Add a comparison to the Smith 2023 results"
- "Make it shorter"

Each response replaces the working summary with an updated version.

### Save the summary

Click **Commit** to write the working summary as a child note (tagged `zs-summary`) on the item. The parent item gets a `zs-summarized` tag.

Click **↺** to discard changes and reload from the last committed note.

### Batch summarize

Select multiple items, right-click → Summarize with AI. Items are processed one at a time with a configurable delay between them.

## Tags

The plugin uses tags to track state:

| Tag | On | Meaning |
|---|---|---|
| `zs-context` | Note | Identifies the shared context/config document |
| `zs-summary` | Child note | AI-generated summary |
| `zs-summarized` | Parent item | Has been summarized at least once |
| `zs-model:*` | Child note | Which model produced the summary |
| `zs-date:*` | Child note | When the summary was generated |
| `zs-has-highlights` | Child note | Summary contains a highlighted findings section |
| `zs-error` | Child note | API error log |

## Development

```bash
npm install
npm run build    # builds to .scaffold/build/zo-tldr.xpi
npm run start    # dev server with hot reload
```

## License

[AGPL-3.0-or-later](LICENSE)
