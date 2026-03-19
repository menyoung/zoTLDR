import { config } from "../../package.json";
import { humanizeError } from "../utils/html";
import { loadContextDoc } from "./contextDoc";
import { saveChat, markdownToHTML } from "./noteWriter";
import { ChatMessage, clearSession, getSession } from "./sessionState";
import { chat } from "./summarizer";

const SECTION_ID = "zotldr-summary-section";

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

  const link = doc.createElement("link");
  link.setAttribute("rel", "stylesheet");
  link.setAttribute(
    "href",
    `chrome://${config.addonRef}/content/zoteroPane.css`,
  );
  body.appendChild(link);

  const session = getSession(item.id);

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

  const saveBtn = doc.createElement("button");
  saveBtn.textContent = "Save";
  saveBtn.disabled = !session.isDirty || session.chatHistory.length === 0;

  const clearBtn = doc.createElement("button");
  clearBtn.textContent = "Clear";
  clearBtn.disabled = session.chatHistory.length === 0;

  buttonRow.appendChild(saveBtn);
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
    saveBtn.disabled = busy;
    clearBtn.disabled = busy;

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
    saveBtn.disabled = !s.isDirty || s.chatHistory.length === 0;
    clearBtn.disabled = s.chatHistory.length === 0;

    chatBox.innerHTML = "";
    renderChatMessages(doc, chatBox, s.chatHistory);
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  // --- Event handlers ---

  function doSend() {
    const msg = input.value.trim();
    if (!msg || inFlight) return;
    input.value = "";
    setInFlight(true);
    chat(item, msg).then(
      () =>
        setTimeout(() => {
          updateUI();
          setInFlight(false);
        }, 0),
      (e: any) =>
        setTimeout(() => {
          if (!isStale()) {
            const errorDiv = doc.createElement("div");
            errorDiv.className = "zotldr-chat-error";
            errorDiv.textContent = humanizeError(e.message ?? String(e));
            chatBox.appendChild(errorDiv);
          }
          setInFlight(false);
        }, 0),
    );
  }

  sendBtn.addEventListener("click", doSend);
  input.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter") doSend();
  });

  saveBtn.addEventListener("click", () => {
    if (inFlight) return;
    setInFlight(true);
    loadContextDoc()
      .then((contextConfig) => {
        const s = getSession(item.id);
        saveChat(item, s.chatHistory, contextConfig.model).then(
          () =>
            setTimeout(() => {
              s.isDirty = false;
              updateUI();
              setInFlight(false);
              if (!isStale()) {
                saveBtn.textContent = "\u2713 Saved";
                setTimeout(() => {
                  saveBtn.textContent = "Save";
                }, 2000);
              }
            }, 0),
          (e: any) =>
            setTimeout(() => {
              if (!isStale()) {
                const errorDiv = doc.createElement("div");
                errorDiv.className = "zotldr-chat-error";
                errorDiv.textContent = humanizeError(e.message ?? String(e));
                chatBox.appendChild(errorDiv);
              }
              setInFlight(false);
            }, 0),
        );
      })
      .catch((e: any) =>
        setTimeout(() => {
          if (!isStale()) {
            const errorDiv = doc.createElement("div");
            errorDiv.className = "zotldr-chat-error";
            errorDiv.textContent = humanizeError(e.message ?? String(e));
            chatBox.appendChild(errorDiv);
          }
          setInFlight(false);
        }, 0),
      );
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
