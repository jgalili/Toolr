/**
 * AI contracts — SHARED between the app and the Supabase Edge Functions.
 *
 * The Edge Function validates the model's response against these before it is
 * allowed anywhere near a user, and the app validates the function's response
 * again on arrival. Nothing the model says is trusted on its word.
 *
 * Keep this file dependency-free apart from zod so Deno can import it directly.
 */

import { z } from 'zod';

export const CATEGORY_SLUGS = [
  'power-tools',
  'hand-tools',
  'gardening',
  'cleaning',
  'ladders',
  'painting',
  'automotive',
  'woodworking',
  'home-repair',
  'moving',
  'camping',
  'other',
] as const;

export const RISK_LEVELS = ['low', 'medium', 'high'] as const;

export const POWER_SOURCES = ['cordless', 'corded', 'manual', 'petrol', 'unknown'] as const;

/**
 * Confidence thresholds. These are the product's honesty policy expressed as
 * numbers, and they are applied SERVER-SIDE so a tampered client cannot make
 * the app state a model number the vision model was unsure about.
 */
export const CONFIDENCE = {
  /** Below this, `model` is forced to null and the UI says "model uncertain". */
  model: 0.7,
  /** Below this, `brand` is forced to null. */
  brand: 0.6,
  /** At or above this, show a single candidate to confirm. */
  high: 0.8,
  /** At or above this (but below `high`), show 2–4 options. */
  medium: 0.5,
} as const;

export type ConfidenceTier = 'high' | 'medium' | 'low';

export function tierFor(typeConfidence: number): ConfidenceTier {
  if (typeConfidence >= CONFIDENCE.high) return 'high';
  if (typeConfidence >= CONFIDENCE.medium) return 'medium';
  return 'low';
}

const confidence = z.number().min(0).max(1);

export const alternativeSchema = z.object({
  brand: z.string().max(60).nullable().default(null),
  model: z.string().max(60).nullable().default(null),
  tool_type: z.string().min(1).max(60),
  confidence,
});

/** Exactly what we require back from the vision model. */
export const identificationSchema = z.object({
  is_tool: z.boolean(),
  category: z.enum(CATEGORY_SLUGS).nullable().default(null),
  tool_type: z.string().max(60).nullable().default(null),
  tool_type_confidence: confidence.default(0),
  brand: z.string().max(60).nullable().default(null),
  brand_confidence: confidence.default(0),
  model: z.string().max(60).nullable().default(null),
  model_confidence: confidence.default(0),
  power_source: z.enum(POWER_SOURCES).default('unknown'),
  visible_accessories: z.array(z.string().max(40)).max(10).default([]),
  condition_hint: z.enum(['like_new', 'good', 'worn', 'unknown']).default('unknown'),
  risk: z.enum(RISK_LEVELS).default('low'),
  suggested_title: z.string().max(80).nullable().default(null),
  suggested_description: z.string().max(200).nullable().default(null),
  alternatives: z.array(alternativeSchema).max(4).default([]),
  notes: z.string().max(200).nullable().default(null),
});

export type Identification = z.infer<typeof identificationSchema>;
export type Alternative = z.infer<typeof alternativeSchema>;

/**
 * Apply the confidence policy. Runs on the server, before the response is
 * returned — a correct generic answer is far better than a plausible wrong
 * specific one, and this is where that is enforced rather than hoped for.
 */
export function applyConfidencePolicy(raw: Identification): Identification {
  const out: Identification = { ...raw };
  if (out.model_confidence < CONFIDENCE.model) out.model = null;
  if (out.brand_confidence < CONFIDENCE.brand) out.brand = null;
  if (tierFor(out.tool_type_confidence) === 'low') out.alternatives = [];
  if (out.suggested_description) out.suggested_description = out.suggested_description.slice(0, 200);
  return out;
}

/** What the Edge Function returns to the app. */
export const identifyResponseSchema = z.object({
  ok: z.literal(true),
  resultId: z.string().uuid().nullable(),
  tier: z.enum(['high', 'medium', 'low']),
  identification: identificationSchema,
});

export const identifyErrorSchema = z.object({
  ok: z.literal(false),
  code: z.enum(['not_a_tool', 'quota_exceeded', 'invalid_image', 'model_failed', 'unauthorized']),
  message: z.string(),
});

export type IdentifyResponse = z.infer<typeof identifyResponseSchema>;
export type IdentifyError = z.infer<typeof identifyErrorSchema>;

/** Natural-language query interpretation. */
export const interpretationSchema = z.object({
  tool_types: z.array(z.string().max(60)).max(8).default([]),
  categories: z.array(z.enum(CATEGORY_SLUGS)).max(4).default([]),
  keywords: z.array(z.string().max(40)).max(8).default([]),
  explanation_en: z.string().max(120).default(''),
  explanation_he: z.string().max(120).default(''),
  confidence: confidence.default(0),
});

export type Interpretation = z.infer<typeof interpretationSchema>;

export const interpretResponseSchema = z.object({
  ok: z.literal(true),
  cached: z.boolean(),
  interpretation: interpretationSchema,
});
