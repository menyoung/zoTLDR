interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface SessionState {
  workingSummary: string;
  chatHistory: ChatMessage[];
  isDirty: boolean;
}

const sessions = new Map<number, SessionState>();

export function getSession(itemID: number): SessionState {
  let s = sessions.get(itemID);
  if (!s) {
    s = { workingSummary: "", chatHistory: [], isDirty: false };
    sessions.set(itemID, s);
  }
  return s;
}

export function initSession(
  itemID: number,
  existingSummary: string,
): SessionState {
  const s: SessionState = {
    workingSummary: existingSummary,
    chatHistory: [],
    isDirty: false,
  };
  sessions.set(itemID, s);
  return s;
}

export function clearAllSessions(): void {
  sessions.clear();
}

export type { ChatMessage, SessionState };
