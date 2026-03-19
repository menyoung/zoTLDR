import { config } from "../../package.json";
import { humanizeError, markdownToHTML } from "../utils/html";
import { ContextConfig, loadContextDoc } from "./contextDoc";
import { saveChat, saveResponse } from "./noteWriter";
import { ChatMessage, clearSession, getSession } from "./sessionState";
import { chat } from "./chat";

const SECTION_ID = "zotldr-summary-section";

let currentItemID: number | null = null;
let renderGen = 0;
let cachedActions: string[] | null = null;

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
      if (props.item.id !== currentItemID) {
        // Free cached PDF data from the previous item's session
        if (currentItemID !== null) {
          const prev = getSession(currentItemID);
          prev.pdfBase64 = "";
        }
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

  const link = doc.createElement("link");
  link.setAttribute("rel", "stylesheet");
  link.setAttribute(
    "href",
    `chrome://${config.addonRef}/content/zoteroPane.css`,
  );
  body.appendChild(link);

  const session = getSession(item.id);

  // Quick actions (loaded async, rendered when ready)
  const actionsRow = doc.createElement("div");
  actionsRow.className = "zotldr-actions-row";
  body.appendChild(actionsRow);

  // Chat transcript
  const chatBox = doc.createElement("div");
  chatBox.className = "zotldr-chat-box";
  renderChatMessages(doc, chatBox, session.chatHistory);
  body.appendChild(chatBox);

  // Input row
  const inputRow = doc.createElement("div");
  inputRow.className = "zotldr-input-row";

  const input = doc.createElement("input");
  input.type = "text";
  input.placeholder = "Ask about this paper\u2026";

  const sendBtn = doc.createElement("button");
  sendBtn.textContent = "Send";

  inputRow.appendChild(input);
  inputRow.appendChild(sendBtn);
  body.appendChild(inputRow);

  // Button row
  const buttonRow = doc.createElement("div");
  buttonRow.className = "zotldr-button-row";

  const saveChatBtn = doc.createElement("button");
  saveChatBtn.textContent = "Save chat";
  saveChatBtn.disabled = !session.isDirty || session.chatHistory.length === 0;

  const saveResponseBtn = doc.createElement("button");
  saveResponseBtn.textContent = "Save response";
  saveResponseBtn.disabled = session.chatHistory.length === 0;

  const clearBtn = doc.createElement("button");
  clearBtn.textContent = "Clear";
  clearBtn.disabled = session.chatHistory.length === 0;

  buttonRow.appendChild(saveChatBtn);
  buttonRow.appendChild(saveResponseBtn);
  buttonRow.appendChild(clearBtn);
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
    saveChatBtn.disabled = busy;
    saveResponseBtn.disabled = busy;
    clearBtn.disabled = busy;

    // Disable action buttons too
    for (const btn of actionsRow.querySelectorAll("button")) {
      (btn as HTMLButtonElement).disabled = busy;
    }

    const existingSpinner = body.querySelector(".zotldr-spinner");
    if (busy && !existingSpinner) {
      const spinner = doc.createElement("span");
      spinner.className = "zotldr-spinner";
      buttonRow.appendChild(spinner);
    } else if (!busy && existingSpinner) {
      existingSpinner.remove();
    }
  }

  function showError(error: string) {
    if (isStale()) return;
    const errorDiv = doc.createElement("div");
    errorDiv.className = "zotldr-chat-error";
    errorDiv.textContent = humanizeError(error);
    chatBox.appendChild(errorDiv);
  }

  function updateUI() {
    if (isStale()) return;
    const s = getSession(item.id);
    saveChatBtn.disabled = !s.isDirty || s.chatHistory.length === 0;
    saveResponseBtn.disabled = s.chatHistory.length === 0;
    clearBtn.disabled = s.chatHistory.length === 0;

    chatBox.innerHTML = "";
    renderChatMessages(doc, chatBox, s.chatHistory);
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  // --- Send a message (used by input, send button, and quick actions) ---

  async function sendMessage(msg: string) {
    if (!msg || inFlight) return;
    input.value = "";
    setInFlight(true);
    try {
      await chat(item, msg);
      updateUI();
    } catch (e: any) {
      showError(e.message ?? String(e));
    }
    setInFlight(false);
  }

  // --- Event handlers ---

  sendBtn.addEventListener("click", () => sendMessage(input.value.trim()));
  input.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter") sendMessage(input.value.trim());
  });

  saveChatBtn.addEventListener("click", async () => {
    if (inFlight) return;
    setInFlight(true);
    try {
      const contextConfig = await loadContextDoc();
      const s = getSession(item.id);
      await saveChat(item, s.chatHistory, contextConfig.model);
      s.isDirty = false;
      updateUI();
      if (!isStale()) {
        saveChatBtn.textContent = "\u2713 Saved";
        setTimeout(() => {
          saveChatBtn.textContent = "Save chat";
        }, 2000);
      }
    } catch (e: any) {
      showError(e.message ?? String(e));
    }
    setInFlight(false);
  });

  saveResponseBtn.addEventListener("click", async () => {
    if (inFlight) return;
    const s = getSession(item.id);
    // Find last assistant message
    const lastResponse = [...s.chatHistory]
      .reverse()
      .find((m) => m.role === "assistant");
    if (!lastResponse) return;

    setInFlight(true);
    try {
      const contextConfig = await loadContextDoc();
      await saveResponse(item, lastResponse.content, contextConfig.model);
      if (!isStale()) {
        saveResponseBtn.textContent = "\u2713 Saved";
        setTimeout(() => {
          saveResponseBtn.textContent = "Save response";
        }, 2000);
      }
    } catch (e: any) {
      showError(e.message ?? String(e));
    }
    setInFlight(false);
  });

  clearBtn.addEventListener("click", () => {
    const s = getSession(item.id);
    if (s.isDirty) {
      if (clearBtn.textContent === "Discard?") {
        clearSession(item.id);
        updateUI();
        clearBtn.textContent = "Clear";
      } else {
        clearBtn.textContent = "Discard?";
        setTimeout(() => {
          clearBtn.textContent = "Clear";
        }, 3000);
      }
    } else {
      clearSession(item.id);
      updateUI();
    }
  });

  // --- Load quick actions from context doc ---

  loadActions().then((actions) => {
    if (isStale() || actions.length === 0) return;
    for (const label of actions) {
      const btn = doc.createElement("button");
      btn.textContent = label;
      btn.disabled = inFlight;
      btn.addEventListener("click", () => sendMessage(label));
      actionsRow.appendChild(btn);
    }
  });
}

async function loadActions(): Promise<string[]> {
  if (cachedActions !== null) return cachedActions;
  try {
    const ctx = await loadContextDoc();
    cachedActions = ctx.actions;
    return cachedActions;
  } catch {
    return [];
  }
}

function renderChatMessages(
  doc: Document,
  container: HTMLElement,
  messages: ChatMessage[],
) {
  for (const msg of messages) {
    const div = doc.createElement("div");
    if (msg.role === "user") {
      div.className = "zotldr-chat-user";
      div.textContent = msg.content;
    } else {
      div.className = "zotldr-chat-assistant";
      div.innerHTML = markdownToHTML(msg.content);
    }
    container.appendChild(div);
  }
}
