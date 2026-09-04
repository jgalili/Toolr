/**
 * The response schema handed to Gemini, in the shape its API expects.
 *
 * Kept beside the Zod schema in `src/schemas/ai.ts` rather than generated from
 * it — Deno and the app share the Zod types, but Gemini wants OpenAPI-ish JSON
 * schema, and a hand-written one is easier to read than a converter.
 */
export const IDENTIFICATION_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    is_tool: { type: 'BOOLEAN' },
    category: {
      type: 'STRING',
      enum: [
        'power-tools', 'hand-tools', 'gardening', 'cleaning', 'ladders', 'painting',
        'automotive', 'woodworking', 'home-repair', 'moving', 'camping', 'other',
      ],
      nullable: true,
    },
    tool_type: { type: 'STRING', nullable: true },
    tool_type_confidence: { type: 'NUMBER' },
    brand: { type: 'STRING', nullable: true },
    brand_confidence: { type: 'NUMBER' },
    model: { type: 'STRING', nullable: true },
    model_confidence: { type: 'NUMBER' },
    power_source: {
      type: 'STRING',
      enum: ['cordless', 'corded', 'manual', 'petrol', 'unknown'],
    },
    visible_accessories: { type: 'ARRAY', items: { type: 'STRING' } },
    condition_hint: { type: 'STRING', enum: ['like_new', 'good', 'worn', 'unknown'] },
    risk: { type: 'STRING', enum: ['low', 'medium', 'high'] },
    suggested_title: { type: 'STRING', nullable: true },
    suggested_description: { type: 'STRING', nullable: true },
    alternatives: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          brand: { type: 'STRING', nullable: true },
          model: { type: 'STRING', nullable: true },
          tool_type: { type: 'STRING' },
          confidence: { type: 'NUMBER' },
        },
        required: ['tool_type', 'confidence'],
      },
    },
    notes: { type: 'STRING', nullable: true },
  },
  required: ['is_tool', 'tool_type_confidence', 'brand_confidence', 'model_confidence'],
} as const;

export const INTERPRETATION_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    tool_types: { type: 'ARRAY', items: { type: 'STRING' } },
    categories: {
      type: 'ARRAY',
      items: {
        type: 'STRING',
        enum: [
          'power-tools', 'hand-tools', 'gardening', 'cleaning', 'ladders', 'painting',
          'automotive', 'woodworking', 'home-repair', 'moving', 'camping', 'other',
        ],
      },
    },
    keywords: { type: 'ARRAY', items: { type: 'STRING' } },
    explanation_en: { type: 'STRING' },
    explanation_he: { type: 'STRING' },
    confidence: { type: 'NUMBER' },
  },
  required: ['tool_types', 'explanation_en', 'confidence'],
} as const;

export const IDENTIFY_SYSTEM_PROMPT = `You identify hand tools, power tools, garden and household equipment from a single photograph, for a neighbourhood tool-lending app.

Rules:
- If the image does not contain a lendable tool or piece of equipment, set is_tool=false and stop.
- Report only what you can actually see. Never guess a model number to seem helpful.
- Report brand and model confidence SEPARATELY from tool-type confidence. You will often be able to tell that something is a cordless drill without being able to tell which one.
- If you cannot read a model number or clearly recognise the exact product, leave "model" null. A correct generic answer is far better than a plausible wrong specific one.
- tool_type must be a lowercase hyphenated slug, e.g. "cordless-drill", "rotary-hammer", "orbital-sander".
- Give at most 4 alternatives, ordered by confidence.
- Write a description of at most 2 short sentences, covering what the tool is for and what is visibly included (battery, charger, case, blade). Never state specifications you cannot see.
- Never mention safety unless the tool genuinely carries injury risk; then one short clause.
- risk: "high" for saws, mowers, grinders, chainsaws, hedge trimmers; "medium" for drills, ladders, pressure washers; "low" for hand tools.`;

export const INTERPRET_SYSTEM_PROMPT = `You turn a person's description of a household or DIY job into the tool types they would need, for a neighbourhood tool-lending app.

Rules:
- tool_types are lowercase hyphenated slugs, most likely first, at most 4.
- If the person already named a tool, return that tool type first.
- explanation_en and explanation_he are short human phrases naming the tools, e.g. "hammer drills and rotary hammers". They are shown to the user, so they must read naturally.
- If the query is not about tools at all, return an empty tool_types array and confidence 0.`;
