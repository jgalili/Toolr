import { z } from 'npm:zod@3';

import { adminClient, requireCaller, userClient } from '../_shared/auth.ts';
import { json, preflight } from '../_shared/cors.ts';
import { generateJson } from '../_shared/gemini.ts';
import { IDENTIFICATION_RESPONSE_SCHEMA, IDENTIFY_SYSTEM_PROMPT } from '../_shared/schema.ts';

const PROMPT_VERSION = 'identify-v1';
const DAILY_QUOTA = 25;
const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 10_000;

/* Mirrors src/schemas/ai.ts. Kept here so Deno needs no path mapping. */
const confidence = z.number().min(0).max(1);
const identificationSchema = z.object({
  is_tool: z.boolean(),
  category: z.string().nullable().default(null),
  tool_type: z.string().max(60).nullable().default(null),
  tool_type_confidence: confidence.default(0),
  brand: z.string().max(60).nullable().default(null),
  brand_confidence: confidence.default(0),
  model: z.string().max(60).nullable().default(null),
  model_confidence: confidence.default(0),
  power_source: z.enum(['cordless', 'corded', 'manual', 'petrol', 'unknown']).default('unknown'),
  visible_accessories: z.array(z.string().max(40)).max(10).default([]),
  condition_hint: z.enum(['like_new', 'good', 'worn', 'unknown']).default('unknown'),
  risk: z.enum(['low', 'medium', 'high']).default('low'),
  suggested_title: z.string().max(80).nullable().default(null),
  suggested_description: z.string().max(200).nullable().default(null),
  alternatives: z
    .array(
      z.object({
        brand: z.string().max(60).nullable().default(null),
        model: z.string().max(60).nullable().default(null),
        tool_type: z.string().max(60),
        confidence,
      }),
    )
    .max(4)
    .default([]),
  notes: z.string().max(200).nullable().default(null),
});

const CATEGORIES = new Set([
  'power-tools', 'hand-tools', 'gardening', 'cleaning', 'ladders', 'painting',
  'automotive', 'woodworking', 'home-repair', 'moving', 'camping', 'other',
]);

/** Magic-byte sniffing. The client-declared content type is not evidence. */
function sniff(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  if (bytes[8] === 0x57 && bytes[9] === 0x45) return 'image/webp';
  return null;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();

  const caller = await requireCaller(req);
  if (!caller) return json({ ok: false, code: 'unauthorized', message: 'Sign in first' }, 401);
  if (caller.isAnonymous) {
    return json({ ok: false, code: 'unauthorized', message: 'Guests cannot list tools' }, 403);
  }

  const { path } = (await req.json().catch(() => ({}))) as { path?: string };
  if (!path || !path.startsWith(`${caller.id}/`)) {
    return json({ ok: false, code: 'invalid_image', message: 'Bad path' }, 400);
  }

  const admin = adminClient();

  // Quota is enforced in Postgres, not here — an in-memory counter is useless
  // across serverless invocations.
  const { data: allowed } = await userClient(req).rpc('consume_ai_quota', {
    p_feature: 'identify',
    p_limit: DAILY_QUOTA,
  });
  if (allowed === false) {
    return json({ ok: false, code: 'quota_exceeded', message: "That's today's identifications" }, 429);
  }

  const download = await admin.storage.from('ai-temp').download(path);
  if (download.error || !download.data) {
    return json({ ok: false, code: 'invalid_image', message: 'Could not read image' }, 400);
  }

  const buffer = new Uint8Array(await download.data.arrayBuffer());
  if (buffer.byteLength > MAX_BYTES) {
    return json({ ok: false, code: 'invalid_image', message: 'Image too large' }, 400);
  }
  const mime = sniff(buffer);
  if (!mime) {
    return json({ ok: false, code: 'invalid_image', message: 'Not an image' }, 400);
  }

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let raw: unknown;
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const result = await generateJson(
      [
        { text: 'Identify this tool.' },
        { inline_data: { mime_type: mime, data: toBase64(buffer) } },
      ],
      IDENTIFY_SYSTEM_PROMPT,
      IDENTIFICATION_RESPONSE_SCHEMA as unknown as Record<string, unknown>,
      controller.signal,
    );
    raw = result.json;
    inputTokens = result.inputTokens;
    outputTokens = result.outputTokens;
  } catch (error) {
    console.error('gemini failed', error);
    return json({ ok: false, code: 'model_failed', message: 'The helper is busy' }, 502);
  } finally {
    clearTimeout(timer);
  }

  const parsed = identificationSchema.safeParse(raw);
  if (!parsed.success) {
    console.error('validation failed', parsed.error.flatten());
    return json({ ok: false, code: 'model_failed', message: 'Unusable response' }, 502);
  }

  const identification = parsed.data;

  if (!identification.is_tool) {
    await admin.storage.from('ai-temp').remove([path]);
    return json({ ok: false, code: 'not_a_tool', message: "That doesn't look like a tool" }, 200);
  }

  // ── THE CONFIDENCE POLICY ────────────────────────────────────────────────
  // Applied here, server-side, so a tampered client cannot make the app state
  // a model number the vision model was not sure about.
  if (identification.model_confidence < 0.7) identification.model = null;
  if (identification.brand_confidence < 0.6) identification.brand = null;
  if (!identification.category || !CATEGORIES.has(identification.category)) {
    identification.category = 'other';
  }

  const tier =
    identification.tool_type_confidence >= 0.8
      ? 'high'
      : identification.tool_type_confidence >= 0.5
        ? 'medium'
        : 'low';
  if (tier === 'low') identification.alternatives = [];

  const { data: row } = await admin
    .from('ai_identification_results')
    .insert({
      user_id: caller.id,
      image_path: path,
      model_name: Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash-lite',
      prompt_version: PROMPT_VERSION,
      raw_response: raw as Record<string, unknown>,
      parsed: identification,
      is_tool: identification.is_tool,
      top_confidence: identification.tool_type_confidence,
      latency_ms: Date.now() - started,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    })
    .select('id')
    .single();

  return json({ ok: true, resultId: row?.id ?? null, tier, identification });
});
