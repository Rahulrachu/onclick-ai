import axios from "axios";

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function callLLMProvider(messages: LLMMessage[], model = "gpt-4o"): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.BUILT_IN_FORGE_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || process.env.BUILT_IN_FORGE_API_URL || "https://api.openai.com/v1";

  if (!apiKey) {
    return JSON.stringify({
      steps: [
        { title: "Autonomous Research", description: "Search web sources using real browser engine", agent: "Research" },
        { title: "Page Extraction & Verification", description: "Extract DOM text and verify sources", agent: "Browser" },
        { title: "Synthesize & Generate Artifact", description: "Build structured report and export PDF", agent: "File" },
      ],
      summary: "Fallback deterministic plan generated due to missing external LLM key.",
    });
  }

  try {
    const response = await axios.post(
      `${baseUrl}/chat/completions`,
      {
        model,
        messages,
        temperature: 0.2,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 25000,
      }
    );
    return response.data?.choices?.[0]?.message?.content || "";
  } catch (err: any) {
    console.warn("[LLM Provider] Error calling LLM API, falling back to heuristic plan:", err.message);
    return JSON.stringify({
      steps: [
        { title: "Autonomous Execution", description: "Execute goal via specialized agents", agent: "Orchestrator" },
      ],
      summary: "Fallback plan due to API error.",
    });
  }
}
