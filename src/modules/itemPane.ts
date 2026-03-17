import { config } from "../../package.json";
import { loadContextDoc } from "./contextDoc";
import { commitSummary, getExistingSummary, markdownToHTML } from "./noteWriter";
import { getSession, initSession } from "./sessionState";
import { chat, summarize } from "./summarizer";

const SECTION_ID = "zotldr-summary-section";

// Track which item the panel is currently rendering and a generation counter
// so stale async callbacks become no-ops
let currentItemID: number | null = null;
let renderGen = 0;

export function registerItemPaneSection() {
  Zotero.ItemPaneManager.registerSection({
    paneID: SECTION_ID,
    pluginID: config.addonID,
    header: {
      l10nID: `${config.addonRef}-item-section-summary-head-text`,
      icon: `chrome://${config.addonRef}/content/icons/favicon.png`,
    },
    sidenav: {
      l10nID: `${config.addonRef}-item-section-summary-head-text`,
      icon: `chrome://${config.addonRef}/content/icons/favicon.png`,
    },
    onRender: (props) => {
      currentItemID = props.item.id;
      renderPanel(props.body, props.item);
    },
    onItemChange: (props) => {
      // Only re-render if the item actually changed
      if (props.item.id !== currentItemID) {
        currentItemID = props.item.id;
        renderPanel(props.body, props.item);
      }
    },
  });
}

function renderPanel(body: HTMLElement, item: Zotero.Item) {
  const gen = ++renderGen;
  body.innerHTML = "";

  const doc = body.ownerDocument!;

  // Load stylesheet
  const link = doc.createElement("link");
  link.setAttribute("rel", "stylesheet");
  link.setAttribute(
    "href",
    `chrome://${config.addonRef}/content/zoteroPane.css`,
  );
  body.appendChild(link);

  // Initialize session if needed
  const existing = getExistingSummary(item);
  let session = getSession(item.id);
  if (!session.workingSummary && existing) {
    session = initSession(item.id, existing);
  }

  // Summary box
  const summaryBox = doc.createElement("div");
  summaryBox.className = "zotldr-summary-box";
  if (session.workingSummary) {
    summaryBox.innerHTML = markdownToHTML(session.workingSummary);
  }
  body.appendChild(summaryBox);

  // Dirty indicator
  const dirtyEl = doc.createElement("span");
  dirtyEl.className = "zotldr-dirty-indicator";
  dirtyEl.textContent = session.isDirty ? "(unsaved changes)" : "";
  body.appendChild(dirtyEl);

  // Chat history box
  const chatBox = doc.createElement("div");
  chatBox.className = "zotldr-chat-box";
  renderChatMessages(doc, chatBox, session.chatHistory);
  body.appendChild(chatBox);

  // Input row
  const inputRow = doc.createElement("div");
  inputRow.className = "zotldr-input-row";

  const input = doc.createElement("input");
  input.type = "text";
  input.placeholder = "Ask a follow-up...";

  const sendBtn = doc.createElement("button");
  sendBtn.textContent = "Send";

  inputRow.appendChild(input);
  inputRow.appendChild(sendBtn);
  body.appendChild(inputRow);

  // Button row
  const buttonRow = doc.createElement("div");
  buttonRow.className = "zotldr-button-row";

  const summarizeBtn = doc.createElement("button");
  summarizeBtn.textContent = "Summarize";

  const commitBtn = doc.createElement("button");
  commitBtn.textContent = "Commit";
  commitBtn.disabled = !session.isDirty;

  const reloadBtn = doc.createElement("button");
  reloadBtn.textContent = "↺";
  reloadBtn.title = "Reload from saved note";

  buttonRow.appendChild(summarizeBtn);
  buttonRow.appendChild(commitBtn);
  buttonRow.appendChild(reloadBtn);
  body.appendChild(buttonRow);

  // --- State helpers ---

  let inFlight = false;

  function isStale() {
    return renderGen !== gen;
  }

  function setInFlight(busy: boolean) {
    if (isStale()) return;
    inFlight = busy;
    input.disabled = busy;
    sendBtn.disabled = busy;
    summarizeBtn.disabled = busy;
    commitBtn.disabled = busy;
    reloadBtn.disabled = busy;

    const existingSpinner = body.querySelector(".zotldr-spinner");
    if (busy && !existingSpinner) {
      const spinner = doc.createElement("span");
      spinner.className = "zotldr-spinner";
      buttonRow.appendChild(spinner);
    } else if (!busy && existingSpinner) {
      existingSpinner.remove();
    }
  }

  function updateUI() {
    if (isStale()) return;
    const s = getSession(item.id);
    summaryBox.innerHTML = s.workingSummary
      ? markdownToHTML(s.workingSummary)
      : "";
    dirtyEl.textContent = s.isDirty ? "(unsaved changes)" : "";
    commitBtn.disabled = !s.isDirty;

    chatBox.innerHTML = "";
    renderChatMessages(doc, chatBox, s.chatHistory);
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  // --- Event handlers ---

  summarizeBtn.addEventListener("click", () => {
    if (inFlight) return;
    setInFlight(true);
    summarize(item).then(
      () => setTimeout(() => { updateUI(); setInFlight(false); }, 0),
      (e: any) => setTimeout(() => {
        if (!isStale()) summaryBox.textContent = `Error: ${e.message ?? e}`;
        setInFlight(false);
      }, 0),
    );
  });

  function doSend() {
    const msg = input.value.trim();
    if (!msg || inFlight) return;
    input.value = "";
    setInFlight(true);
    chat(item, msg).then(
      () => setTimeout(() => { updateUI(); setInFlight(false); }, 0),
      (e: any) => setTimeout(() => {
        if (!isStale()) summaryBox.textContent = `Error: ${e.message ?? e}`;
        setInFlight(false);
      }, 0),
    );
  }

  sendBtn.addEventListener("click", doSend);
  input.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter") doSend();
  });

  commitBtn.addEventListener("click", () => {
    if (inFlight) return;
    setInFlight(true);
    loadContextDoc().then((contextConfig) => {
      const s = getSession(item.id);
      commitSummary(item, s.workingSummary, contextConfig).then(
        () => setTimeout(() => {
          s.isDirty = false;
          updateUI();
          setInFlight(false);
          if (!isStale()) {
            commitBtn.textContent = "✓ Committed";
            setTimeout(() => { commitBtn.textContent = "Commit"; }, 2000);
          }
        }, 0),
        (e: any) => setTimeout(() => {
          if (!isStale()) summaryBox.textContent = `Error committing: ${e.message ?? e}`;
          setInFlight(false);
        }, 0),
      );
    }).catch((e: any) => setTimeout(() => {
      if (!isStale()) summaryBox.textContent = `Error committing: ${e.message ?? e}`;
      setInFlight(false);
    }, 0));
  });

  reloadBtn.addEventListener("click", () => {
    const s = getSession(item.id);
    if (s.isDirty) {
      if (reloadBtn.textContent === "Discard changes?") {
        initSession(item.id, getExistingSummary(item));
        updateUI();
        reloadBtn.textContent = "↺";
      } else {
        reloadBtn.textContent = "Discard changes?";
        setTimeout(() => { reloadBtn.textContent = "↺"; }, 3000);
      }
    } else {
      initSession(item.id, getExistingSummary(item));
      updateUI();
    }
  });
}

function renderChatMessages(
  doc: Document,
  container: HTMLElement,
  messages: { role: string; content: string }[],
) {
  for (const msg of messages) {
    const div = doc.createElement("div");
    div.className =
      msg.role === "user" ? "zotldr-chat-user" : "zotldr-chat-assistant";
    // Only show user messages in full; assistant responses are already
    // reflected in the summary box, so just show a brief confirmation
    div.textContent =
      msg.role === "user" ? `You: ${msg.content}` : "✓ Summary updated";
    container.appendChild(div);
  }
}
