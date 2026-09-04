import { z } from 'npm:zod@3';

import { adminClient, requireCaller, userClient } from '../_shared/auth.ts';
import { json, preflight } from '../_shared/cors.ts';
import { generateJson } from '../_shared/gemini.ts';
import { INTERPRETATION_RESPONSE_SCHEMA, INTERPRET_SYSTEM_PROMPT } from '../_shared/schema.ts';

const MEMBER_QUOTA = 100;
const GUEST_QUOTA = 20;

const interpretationSchema = z.object({
  tool_types: z.array(z.string().max(60)).max(8).default([]),
  categories: z.array(z.string()).max(4).default([]),
  keywords: z.array(z.string().max(40)).max(8).default([]),
  explanation_en: z.string().max(120).default(''),
  explanation_he: z.string().max(120).default(''),
  confidence: z.number().min(0).max(1).default(0),
});

async function sha256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();

  const caller = await requireCaller(req);
  if (!caller) return json({ ok: false, code: 'unauthorized' }, 401);

  const { query, locale } = (await req.json().catch(() => ({}))) as {
    query?: string;
    locale?: string;
  };
  const text = (query ?? '').trim();
  if (text.length < 2) return json({ ok: false, code: 'invalid' }, 400);

  const admin = adminClient();
  const hash = await sha256(`${text.toLowerCase()}:${locale ?? 'en'}`);

  // Cache first. "drill" gets interpreted once, ever — popular queries cost
  // nothing and return in milliseconds.
  const { data: cached } = await admin
    .from('ai_query_cache')
    .select('parsed, hit_count')
    .eq('query_hash', hash)
    .maybeSingle();

  if (cached) {
    await admin
      .from('ai_query_cache')
      .update({ hit_count: (cached.hit_count ?? 0) + 1, last_used_at: new Date().toISOString() })
      .eq('query_hash', hash);
    return json({ ok: true, cached: true, interpretation: cached.parsed });
  }

  const { data: allowed } = await userClient(req).rpc('consume_ai_quota', {
    p_feature: 'interpret',
    p_limit: caller.isAnonymous ? GUEST_QUOTA : MEMBER_QUOTA,
  });
  if (allowed === false) return json({ ok: false, code: 'quota_exceeded' }, 429);

  try {
    const { json: raw } = await generateJson(
      [{ text }],
      INTERPRET_SYSTEM_PROMPT,
      INTERPRETATION_RESPONSE_SCHEMA as unknown as Record<string, unknown>,
    );
    const parsed = interpretationSchema.safeParse(raw);
    if (!parsed.success) return json({ ok: false, code: 'model_failed' }, 502);

    await admin.from('ai_query_cache').insert({
      query_hash: hash,
      query_text: text,
      locale: locale ?? 'en',
      parsed: parsed.data,
    });

    return json({ ok: true, cached: false, interpretation: parsed.data });
  } catch (error) {
    console.error('interpret failed', error);
    // The app degrades to plain keyword search on a null. Slightly worse
    // results, zero breakage.
    return json({ ok: false, code: 'model_failed' }, 502);
  }
});
