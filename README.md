# zoTLDR

Chat with AI about papers in [Zotero 8](https://www.zotero.org/) using Google Gemini. Ask questions, explore findings, and discuss any paper you have open — the PDF and your team's context are injected automatically.

Designed for research teams: a shared **context document** configures the API key, model, and domain-specific system prompt centrally, so every team member gets consistent, domain-aware responses.

## Install

1. Download the latest `.xpi` from [Releases](https://github.com/menyoung/zoTLDR/releases)
2. In Zotero: Tools → Add-ons → gear icon → Install Add-on From File → select the `.xpi`

Requires Zotero 8.

## Setup

### 1. Create a context document

Create a **note** in your Zotero library (ideally a group library so the whole team shares it). Tag it `zs-context`. Write it in this format:

```
---
api_key: AIzaSy...
model: gemini-3-flash-preview
max_tokens: 2000
---

You are a research assistant for a materials research team.
Focus on: deposition chemistry, reactor conditions, microstructure outcomes.
Always note sample preparation details and characterization methods used.
```

- **Frontmatter** (`api_key`, `model`, `max_tokens`) is parsed as configuration
- **Everything below the closing `---`** is sent to the LLM as the system prompt — write whatever domain context helps the AI understand your team's work

### 2. Configure the plugin

Go to Zotero → Settings → zoTLDR → click **"Pick from library..."** to select your `zs-context` note. The picker finds all notes tagged `zs-context` across your libraries.

## Usage

### Chat about a paper

Select an item in your library. In the **AI Chat** panel (right-side item pane), type a question and press Enter. The full PDF is sent to the model on the first message — tables, figures, and equations included.

Examples:

- "What are the main findings?"
- "How did they prepare the samples?"
- "Compare the results in Table 2 to the claims in the introduction"
- "Summarize this paper in 3 bullet points"
- "What are the limitations of this study?"

The conversation persists as you navigate between items within a Zotero session.

### Save a conversation

Click **Save** to write the chat transcript as a child note (tagged `zs-chat`) on the item.

Click **Clear** to reset the conversation. If there are unsaved changes, you'll be asked to confirm.

## Troubleshooting

**"No PDF attachment found"** — The item needs a PDF attachment. Linked files and stored files both work.

**"Context document not configured"** — Go to Settings → zoTLDR → click "Pick from library..." to select your `zs-context` note.

**"API key missing"** — Verify your `zs-context` note has `api_key: AIzaSy...` in the frontmatter (between the `---` lines).

**"API error"** — Check that your Google API key is active and has the Generative Language API enabled in Google Cloud Console.

## Tags

| Tag | On | Meaning |
|---|---|---|
| `zs-context` | Note | Shared context/config document |
| `zs-chat` | Child note | Saved chat transcript |
| `zs-model:*` | Child note | Which model produced the response |
| `zs-date:*` | Child note | When the conversation was saved |
| `zs-error` | Child note | API error log |

## Development

```bash
npm install
npm run build    # builds .xpi to .scaffold/build/
npm run start    # dev server with hot reload
```

## License

[MIT](LICENSE)
