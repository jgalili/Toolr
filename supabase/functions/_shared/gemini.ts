/**
 * Gemini client.
 *
 * The API key is read from an Edge Function secret and never leaves the
 * server. `responseSchema` constrains the model to schema-conformant JSON —
 * but we still validate what comes back with Zod, because a constrained
 * decoder is a strong hint, not a guarantee.
 */
const MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash-lite';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

export async function generateJson(
  parts: GeminiPart[],
  systemInstruction: string,
  responseSchema: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<{ json: unknown; inputTokens: number; outputTokens: number }> {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) throw new Error('GEMINI_API_KEY is not set');

  const response = await fetch(`${ENDPOINT}?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema,
        temperature: 0.1,
        maxOutputTokens: 1024,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini ${response.status}: ${await response.text()}`);
  }

  const payload = await response.json();
  const text: string | undefined = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned no content');

  return {
    json: JSON.parse(text),
    inputTokens: payload?.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: payload?.usageMetadata?.candidatesTokenCount ?? 0,
  };
}
