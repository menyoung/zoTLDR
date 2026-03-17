# `zotero-summarizer` — Full Plugin Spec for Claude Code

## Overview

A Zotero 7 plugin (XPI, TypeScript) that uses Claude to summarize papers and supports
iterative refinement via an in-panel chat interface. The core product is a team-shared
**context document** stored in the group library; the plugin is the execution engine.

---

## Architecture Summary

### Two-tier configuration

**Tier 1 — Context Document (group library, shared, distributed by team lead)**

A Zotero note item in the group library tagged `zs-context`. All group members read it
automatically since it lives in the shared library. Never edited by scientists. Contains:

```
---
api_key: sk-ant-...
model: claude-sonnet-4-6
max_tokens: 2000
---

You are summarizing CVD silicon carbide papers for a materials research team.
Focus on: deposition chemistry, reactor conditions, microstructure outcomes...
[freeform domain context — passed verbatim as Claude system prompt]
```

Frontmatter fields (machine-parsed): `api_key`, `model`, `max_tokens`.
Everything after the closing `---` is the system prompt body, passed to Claude verbatim.

**Tier 2 — Scientist Preferences (`Zotero.Prefs`, per-user, local)**

- `zs.contextDocKey` — item key of the `zs-context` note (set once via prefs pane)
- `zs.highlights` — freeform text: what the scientist personally cares about
- `zs.batchDelay` — ms between sequential batch jobs (default: 500)
- `zs.showBatchConfirm` — boolean (default: true)

---

## Repository Structure

Use `windingwind/zotero-plugin-template` as scaffold.

```
zotero-summarizer/
  src/
    index.ts            # plugin lifecycle: startup, shutdown, register all hooks
    contextDoc.ts       # load + parse zs-context note from group library
    summarizer.ts       # orchestration: fetch text, build prompt, call LLM, update state
    llm.ts              # Claude API call (plain fetch, no SDK)
    noteWriter.ts       # create/overwrite zs-summary child note
    sessionState.ts     # in-memory session state manager (per itemID)
    itemPane.ts         # registerSection: full panel UI
    prefs.ts            # registerPane: preferences panel
    ui.ts               # context menu + right-click registration
  addon/
    content/
      prefs.xhtml       # preferences pane XUL/XHTML fragment
    manifest.json
    bootstrap.js
  package.json
  tsconfig.json
```

---

## Session State (In-Memory)

`sessionState.ts` maintains a `Map<itemID, SessionState>`:

```typescript
interface SessionState {
  workingSummary: string;        // current in-memory summary (markdown)
  chatHistory: ChatMessage[];    // [{role: 'user'|'assistant', content: string}]
  isDirty: boolean;              // working summary differs from committed note
}
```

State is initialized lazily on first interaction with an item:
- If a `zs-summary` child note already exists → load its text as initial `workingSummary`
- Else → `workingSummary = ''`

State is lost when Zotero closes. No persistence beyond the committed note.

---

## Item Pane Section

Registered via `Zotero.ItemPaneManager.registerSection`. Renders into the right-column
item pane as a collapsible section labeled **"AI Summary"**.

### Layout

```
┌─────────────────────────────────────┐
│ AI Summary                    [▾]   │  ← section header (collapsible)
├─────────────────────────────────────┤
│                                     │
│  [working summary box]              │  ← read-only div, scrollable, ~8 lines
│  renders markdown as simple HTML    │
│                                     │
├─────────────────────────────────────┤
│  [chat history box]                 │  ← scrollable, ~4 lines
│  User: ...                          │
│  Claude: ...                        │
│                                     │
├─────────────────────────────────────┤
│  [input box]              [Send]    │  ← single line, Enter = Send
├─────────────────────────────────────┤
│  [Summarize]  [Commit]  [↺]        │
└─────────────────────────────────────┘
```

### Element Behaviors

**Working summary box**
- Read-only. Not a textarea — a styled `<div>` with `overflow-y: auto`.
- Renders Claude's markdown output with minimal conversion:
  `##` → `<h3>`, `**x**` → `<strong>`, newlines → `<br>`. No heavy parser.
- Shows `(unsaved changes)` indicator in section header when `isDirty = true`.
- Empty state: italic gray text "No summary yet — click Summarize."

**Chat history box**
- Scrollable `<div>`, auto-scrolls to bottom on new message.
- User messages: right-aligned, muted style.
- Assistant messages: left-aligned, normal style.
- Empty state: hidden (zero height) until first message.

**Input box**
- Single-line `<input type="text">`.
- Enter key triggers Send.
- Disabled while a Claude request is in flight.

**Send button**
- Appends user message to chat history.
- Builds prompt (see Chat Prompt Construction below).
- Streams or awaits response, appends to chat history, updates working summary box.
- Sets `isDirty = true`.

**Summarize button**
- Ignores existing session state — fresh summarization run.
- Extracts PDF full text, builds summarize prompt (see below).
- Overwrites working summary box with response.
- Clears chat history.
- Sets `isDirty = true`.
- Shows spinner / disables buttons while in flight.

**Commit button**
- Writes current `workingSummary` to a `zs-summary` child note (see Note Writing).
- Sets `isDirty = false`.
- Shows brief "✓ Committed" confirmation inline.
- Disabled when `!isDirty`.

**↺ (Reload) button**
- Reloads committed note text into `workingSummary`, clears chat history.
- Escape hatch if chat session goes sideways.
- Confirms with a one-line inline prompt if `isDirty`: "Discard changes? [Yes]"

---

## Prompt Construction

### Summarize (fresh run)

```
SYSTEM:
{context doc body — full domain system prompt}

The scientist reviewing this paper has specifically asked you to flag:
{Zotero.Prefs.get('zs.highlights')}    ← omit entire block if empty

If the paper contains anything directly relevant to the above, include a
"## ⚑ Highlighted Findings" section. Omit this section entirely if nothing
is relevant — do not pad.

USER:
Summarize the following paper.

Title: {item.getField('title')}
Authors: {authors string}
Year: {item.getField('year')}

{fulltext}    ← truncated to max_tokens budget (head + tail strategy, see below)
```

### Chat (follow-up message)

```
SYSTEM:
{context doc body}

USER:
[Current working summary of the paper:]
{workingSummary}

USER: {chat message 1}
ASSISTANT: {response 1}
USER: {chat message 2}
ASSISTANT: {response 2}
...
USER: {new message}
```

Each chat response **replaces the working summary** — the assistant is always
instructed (in system prompt) to return a complete updated summary, not a diff.
Add to system prompt: "When responding to follow-up messages, always return the
complete updated summary text, incorporating the requested changes."

---

## Full Text Extraction

```typescript
const attachment = await item.getBestAttachment();
const { text, totalPages } = await Zotero.PDFWorker.getFullText(attachment, {
  maxPages: 50   // configurable; 50 pages ~= 100k chars, well within context window
});
```

**Truncation strategy** if `text.length > charBudget`:
- Take first 60% of budget from head (abstract, intro, methods)
- Take last 40% from tail (results, conclusion)
- Insert `\n\n[... middle sections truncated ...]\n\n` as separator

`charBudget` derived from `max_tokens * 3` (rough chars-per-token estimate), leaving
headroom for system prompt and response.

---

## Claude API Call

Plain `fetch` — no SDK. Keeps dependencies minimal.

```typescript
const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': config.apiKey,
    'anthropic-version': '2023-06-01',
  },
  body: JSON.stringify({
    model: config.model,
    max_tokens: config.maxTokens,
    system: systemPrompt,
    messages: messages,
  }),
});
const data = await response.json();
return data.content[0].text;
```

Error handling: non-2xx response → write a `zs-error` child note with status code +
response body + timestamp. Do not overwrite an existing `zs-summary`.

---

## Note Writing (`noteWriter.ts`)

**On Commit:**

1. Check for existing child note with tag `zs-summary`:
   ```typescript
   const children = item.getNotes();
   const existing = children
     .map(id => Zotero.Items.get(id))
     .find(n => n.getTags().some(t => t.tag === 'zs-summary'));
   ```
2. If found: overwrite note body, update tags.
3. If not found: create new child note.

```typescript
const note = existing ?? new Zotero.Item('note');
note.setNote(markdownToHTML(workingSummary));
note.parentID = item.id;
note.setTags([
  { tag: 'zs-summary' },
  { tag: `zs-model:${config.model}` },
  { tag: `zs-date:${today}` },
  // only if highlights section was non-empty in the response:
  { tag: 'zs-has-highlights' },
]);
await note.saveTx();
```

**Tag on parent item** (added on first commit, never removed by plugin):
```typescript
item.addTag('zs-summarized');
await item.saveTx();
```

**`markdownToHTML`**: minimal inline converter — no external deps.
Handles: `##`/`###` headings, `**bold**`, `\n\n` paragraphs, `\n` line breaks,
`⚑` section gets `<h2 style="color:#c0392b">⚑ Highlighted Findings</h2>`.

---

## Context Document Loading (`contextDoc.ts`)

```typescript
async function loadContextDoc(): Promise<ContextConfig> {
  const key = Zotero.Prefs.get('zs.contextDocKey');
  if (!key) throw new Error('NO_CONTEXT_DOC');

  const item = Zotero.Items.getByKey(key);   // works across libraries
  if (!item || item.itemType !== 'note') throw new Error('CONTEXT_DOC_NOT_FOUND');

  const raw = stripHTML(item.getNote());
  const { frontmatter, body } = parseFrontmatter(raw);

  return {
    apiKey: frontmatter.api_key,
    model: frontmatter.model ?? 'claude-sonnet-4-6',
    maxTokens: parseInt(frontmatter.max_tokens ?? '2000'),
    systemPrompt: body.trim(),
  };
}
```

Re-fetched on every Summarize/Send invocation — context doc updates propagate
immediately without plugin restart.

---

## Context Menu

Registered via `Zotero.ItemTreeView` right-click menu:

- **"Summarize with AI"** — appears on single or multi-item selection
- Single item: triggers Summarize flow, opens/scrolls to AI Summary section in item pane
- Multi-item: shows confirmation dialog if `zs.showBatchConfirm = true`,
  then processes sequentially with `zs.batchDelay` ms between items

---

## Preferences Pane (`prefs.xhtml`)

Registered via `Zotero.PreferencePanes.register`.

```
┌─────────────────────────────────────────────┐
│ Zotero Summarizer                           │
├─────────────────────────────────────────────┤
│                                             │
│  My research focus                          │
│  ┌─────────────────────────────────────┐   │
│  │                                     │   │
│  │  [large textarea — ~6 lines]        │   │
│  │                                     │   │
│  └─────────────────────────────────────┘   │
│  What should the AI pay attention to?       │
│  Saved automatically.                       │
│                                             │
├── Advanced ▸ ──────────────────────────────┤  ← collapsed by default
│                                             │
│  Context document                           │
│  [item key field]  [Pick from library…]    │
│                                             │
│  Batch delay (ms)   [500]                  │
│  ☑ Confirm before batch summarize          │
│                                             │
└─────────────────────────────────────────────┘
```

The textarea is the primary, prominent element. "Advanced" is a `<details>` disclosure
element — scientists never need to open it after initial setup.

Textarea auto-saves to `Zotero.Prefs` on `input` event (debounced 500ms).

"Pick from library…" opens a simple item picker dialog filtered to notes tagged
`zs-context`, sets `zs.contextDocKey`.

---

## Key Zotero 7 APIs

```typescript
// Item access
Zotero.Items.get(itemID)
Zotero.Items.getByKey(key)
item.getBestAttachment()
item.getNotes()                          // returns array of child note IDs
item.getField('title' | 'year' | ...)
item.getCreators()
item.addTag(tag)
item.getTags()
await item.saveTx()

// PDF text
Zotero.PDFWorker.getFullText(attachment, { maxPages: N })
// returns { text: string, totalPages: number }

// Note creation
const note = new Zotero.Item('note')
note.setNote(htmlString)
note.parentID = parentItem.id
note.setTags([{ tag: 'zs-summary' }])
await note.saveTx()

// Item pane
Zotero.ItemPaneManager.registerSection({ paneID, pluginID, header, sidenav, onRender })
Zotero.ItemPaneManager.unregisterSection(registeredID)

// Preferences
Zotero.Prefs.get('zs.highlights')
Zotero.Prefs.set('zs.highlights', value)
Zotero.PreferencePanes.register({ pluginID, src, label, image })
```

---

## Error States

| Condition | Behavior |
|---|---|
| No PDF attachment | Status in pane: "No PDF attached to this item." Summarize button disabled. |
| `zs.contextDocKey` not set | Modal on first use: "Set your context document in Preferences → Zotero Summarizer." |
| Context doc note not found | Same modal with "Context document not found — has it been moved or deleted?" |
| `api_key` missing from frontmatter | Modal: "Context document is missing an api_key. Contact your team lead." |
| Claude API error | Write `zs-error` child note with error details. Show inline: "API error — see error note." |
| PDF text extraction fails | Inline: "Could not extract text from PDF." |
| Request in flight | All buttons disabled, input disabled, spinner on active button. |

---

## Out of Scope (v1)

- On-add automation
- Streaming response (full response awaited before display)
- Context doc editor UI inside Zotero
- Summary version history
- Multi-context-doc support
- Summary diff view between working and committed

---

## Notes for Claude Code

1. **Scaffold:** clone `windingwind/zotero-plugin-template`, it handles manifest.json
   format, esbuild pipeline, hot-reload, and `zotero-plugin-toolkit` integration.

2. **No XUL overlays.** Everything is bootstrapped. All UI elements must be cleaned up
   in `shutdown()` — use the toolkit's `unregisterAll()` pattern.

3. **`onRender` in `registerSection`** receives `{ body, item, editable, tabType }`.
   `body` is a live DOM element — build the entire panel UI by appending children to it.
   `onRender` is called each time a new item is selected; rebuild or reconcile state
   against `sessionState.get(item.id)`.

4. **Session state keyed by `item.id`** (integer, stable within a Zotero session).
   Initialize lazily in `onRender`.

5. **`Zotero.Items.getByKey`** works across libraries — no need to know which library
   the context doc is in, just store the item key in prefs.

6. **Markdown → HTML converter** must be self-contained, no npm deps. ~30 lines of
   regex is sufficient for the subset needed.

7. **Claude API call** — set `anthropic-version: 2023-06-01` header. Response shape:
   `{ content: [{ type: 'text', text: string }] }`. Check `response.ok` before parsing.

8. **`Zotero.Prefs` key prefix** must match `prefsPrefix` in `package.json` to avoid
   collisions with other plugins. Use `extensions.zotero-summarizer.` prefix throughout.

9. **Textarea in prefs pane:** use `<html:textarea>` (HTML namespace) inside the XUL
   fragment. Bind to prefs via `preference` attribute or manually in init JS.

10. **`zs-has-highlights` tag logic:** scan Claude's response text for the string
    `⚑ Highlighted Findings` before writing the note — only add the tag if found and
    the section is non-empty.
