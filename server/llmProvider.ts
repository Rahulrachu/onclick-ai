import { invokeLLM, type Message } from "./_core/llm";

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type LLMProviderErrorCode = "UNCONFIGURED" | "UPSTREAM" | "EMPTY_RESPONSE";

export class LLMProviderError extends Error {
  constructor(
    message: string,
    public readonly code: LLMProviderErrorCode,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "LLMProviderError";
  }
}

function normalizeContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((part): part is { type: "text"; text: string } =>
        Boolean(part && typeof part === "object" && (part as any).type === "text" && typeof (part as any).text === "string"),
      )
      .map((part) => part.text)
      .join("\n");
  }
  return "";
}

export async function callLLMProvider(messages: LLMMessage[], model?: string): Promise<string> {
  if (!process.env.BUILT_IN_FORGE_API_KEY && !process.env.OPENAI_API_KEY) {
    throw new LLMProviderError(
      "No LLM provider is configured. Configure a server-side built-in model credential before starting an autonomous mission.",
      "UNCONFIGURED",
    );
  }

  const providerMessages: Message[] = messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));

  try {
    const response = await invokeLLM({
      messages: providerMessages,
      ...(model || process.env.ONCLICK_LLM_MODEL ? { model: model || process.env.ONCLICK_LLM_MODEL } : {}),
      max_tokens: 4096,
    });
    const content = normalizeContent(response.choices?.[0]?.message?.content);
    if (!content.trim()) {
      throw new LLMProviderError("The configured LLM returned an empty response.", "EMPTY_RESPONSE");
    }
    return content;
  } catch (error) {
    if (error instanceof LLMProviderError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new LLMProviderError(
      `Live LLM request failed: ${message}. Autonomous execution stopped rather than using a fabricated plan.`,
      "UPSTREAM",
      error,
    );
  }
}

export function isLLMProviderError(error: unknown): error is LLMProviderError {
  return error instanceof LLMProviderError;
}

export function parseJsonObject<T>(raw: string): T {
  const normalized = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(normalized) as T;
  } catch {
    const start = normalized.indexOf("{");
    const end = normalized.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(normalized.slice(start, end + 1)) as T;
      } catch {
        // Fall through to the actionable parse error below.
      }
    }
    throw new LLMProviderError("The live LLM returned invalid JSON for a structured agent decision.", "UPSTREAM");
  }
}

export function getLLMConfigurationStatus() {
  return {
    configured: Boolean(process.env.BUILT_IN_FORGE_API_KEY || process.env.OPENAI_API_KEY),
    model: process.env.ONCLICK_LLM_MODEL || "provider-default",
  };
}

export { type Message };
// Keep the import available for callers that need to build provider-native messages.
void invokeLLM;

export default callLLMProvider;

