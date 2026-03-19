interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface SessionState {
  paperContext: string;
  chatHistory: ChatMessage[];
  isDirty: boolean;
}

const sessions = new Map<number, SessionState>();

export function getSession(itemID: number): SessionState {
  let s = sessions.get(itemID);
  if (!s) {
    s = { paperContext: "", chatHistory: [], isDirty: false };
    sessions.set(itemID, s);
  }
  return s;
}

export function clearSession(itemID: number): void {
  sessions.delete(itemID);
}

export function clearAllSessions(): void {
  sessions.clear();
}

export type { ChatMessage, SessionState };
