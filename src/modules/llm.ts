import { ContextConfig } from "./contextDoc";
import { ChatMessage } from "./sessionState";

interface LLMRequest {
  config: ContextConfig;
  systemPrompt: string;
  messages: ChatMessage[];
  pdfBase64?: string;
}

export async function callLLM(req: LLMRequest): Promise<string> {
  // Gemini expects alternating user/model turns with system instruction separate
  const contents = req.messages.map((m, i) => {
    const parts: Record<string, unknown>[] = [];

    // Inject PDF as inline_data in the first user message
    if (i === 0 && req.pdfBase64) {
      parts.push({
        inline_data: {
          mime_type: "application/pdf",
          data: req.pdfBase64,
        },
      });
    }

    parts.push({ text: m.content });

    return {
      role: m.role === "assistant" ? "model" : "user",
      parts,
    };
  });

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
