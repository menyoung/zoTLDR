import { ContextConfig } from "./contextDoc";
import { ChatMessage } from "./sessionState";

interface LLMRequest {
  config: ContextConfig;
  systemPrompt: string;
  messages: ChatMessage[];
}

export async function callLLM(req: LLMRequest): Promise<string> {
  // Gemini expects alternating user/model turns with system instruction separate
  const contents = req.messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${req.config.model}:generateContent?key=${req.config.apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: req.systemPrompt }],
        },
        contents,
        generationConfig: {
          maxOutputTokens: req.config.maxTokens,
        },
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    // Sanitize: don't leak API key into error notes
    const sanitized = body.replace(/key=[^&\s"]+/g, "key=REDACTED");
    throw new Error(`API_ERROR:${response.status}:${sanitized}`);
  }

  const data = (await response.json()) as unknown as {
    candidates?: { content?: { parts?: { text: string }[] } }[];
  };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("API_ERROR:empty response from model");
  }
  return text;
}
