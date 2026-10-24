import { functionDeclarations, type Action } from "./contracts";
export class AiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function queryGemini(
  system: string,
  contents: object[],
  admin: boolean,
  budgetMs = 38000,
) {
  const key =
    process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key)
    throw new AiError(
      503,
      "La atención IA no está configurada. Solicita atención humana.",
    );
  const models = [
    ...new Set(
      (process.env.GEMINI_MODELS || "gemini-flash-lite-latest,gemini-3.6-flash")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ].slice(0, 2);
  let status = 503;
  const started = Date.now();
  for (const model of models) {
    try {
      const remaining = budgetMs - (Date.now() - started);
      if (remaining < 3000) break;
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": key,
          },
          signal: AbortSignal.timeout(Math.min(19000, remaining)),
          body: JSON.stringify({
            system_instruction: { parts: [{ text: system }] },
            contents,
            generationConfig: { temperature: 0.15, maxOutputTokens: 4096 },
            ...(admin ? { tools: [{ functionDeclarations }] } : {}),
          }),
        },
      );
      if (!response.ok) {
        status = response.status;
        console.warn("[AI provider]", { model, status });
        if ([400, 401, 403].includes(status)) break;
        continue;
      }
      const data = await response.json();
      const candidate = data.candidates?.[0];
      if (!candidate || !["STOP", undefined].includes(candidate.finishReason))
        continue;
      const parts = candidate.content?.parts || [];
      const actions: Action[] = parts
        .filter((p: any) => p.functionCall)
        .map((p: any) => ({
          type: p.functionCall.name,
          payload: p.functionCall.args,
        }));
      const text = parts
        .filter((p: any) => typeof p.text === "string" && !p.thought)
        .map((p: any) => p.text)
        .join("\n")
        .trim();
      if (text || actions.length)
        return {
          text,
          actions,
          model,
          tokens: data.usageMetadata?.totalTokenCount || 0,
        };
    } catch {
      console.warn("[AI provider]", { model, status: "timeout_or_network" });
    }
  }
  throw new AiError(
    status === 429 ? 429 : 503,
    status === 429
      ? "La IA alcanzó temporalmente su cuota. Inténtalo más tarde o solicita atención humana."
      : "La IA no está disponible en este momento. Solicita atención humana.",
  );
}
