interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface SessionState {
  pdfBase64: string;
  paperMetadata: string;
  chatHistory: ChatMessage[];
  isDirty: boolean;
}

const sessions = new Map<number, SessionState>();

export function getSession(itemID: number): SessionState {
  let s = sessions.get(itemID);
  if (!s) {
    s = { pdfBase64: "", paperMetadata: "", chatHistory: [], isDirty: false };
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
