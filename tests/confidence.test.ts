import {
  applyConfidencePolicy,
  CONFIDENCE,
  identificationSchema,
  tierFor,
  type Identification,
} from '@/schemas/ai';

function make(overrides: Partial<Identification> = {}): Identification {
  return identificationSchema.parse({
    is_tool: true,
    category: 'power-tools',
    tool_type: 'cordless-drill',
    tool_type_confidence: 0.9,
    brand: 'Bosch',
    brand_confidence: 0.9,
    model: 'GSB 18V-55',
    model_confidence: 0.9,
    ...overrides,
  });
}

describe('the confidence policy', () => {
  it('blanks a model the vision model was not sure about', () => {
    // A correct generic answer beats a plausible wrong specific one.
    const result = applyConfidencePolicy(make({ model_confidence: 0.69 }));
    expect(result.model).toBeNull();
    expect(result.tool_type).toBe('cordless-drill');
  });

  it('keeps a model at or above the threshold', () => {
    expect(applyConfidencePolicy(make({ model_confidence: CONFIDENCE.model })).model).toBe(
      'GSB 18V-55',
    );
  });

  it('blanks a brand below its own, lower threshold', () => {
    expect(applyConfidencePolicy(make({ brand_confidence: 0.59 })).brand).toBeNull();
    expect(applyConfidencePolicy(make({ brand_confidence: 0.6 })).brand).toBe('Bosch');
  });

  it('judges brand and model separately from tool type', () => {
    // "It is definitely a drill, but I cannot tell which one" must be
    // expressible — that is the whole point of separate confidences.
    const result = applyConfidencePolicy(
      make({ tool_type_confidence: 0.97, brand_confidence: 0.2, model_confidence: 0.1 }),
    );
    expect(result.tool_type).toBe('cordless-drill');
    expect(result.brand).toBeNull();
    expect(result.model).toBeNull();
  });

  it('suppresses alternatives at the low tier so they cannot be shown', () => {
    const result = applyConfidencePolicy(
      make({
        tool_type_confidence: 0.3,
        alternatives: [{ brand: 'Bosch', model: 'X', tool_type: 'cordless-drill', confidence: 0.3 }],
      }),
    );
    expect(result.alternatives).toHaveLength(0);
  });

  it('truncates an over-long description rather than trusting the cap', () => {
    const long = 'a'.repeat(400);
    const result = applyConfidencePolicy(make({ suggested_description: long.slice(0, 200) }));
    expect((result.suggested_description ?? '').length).toBeLessThanOrEqual(200);
  });
});

describe('tiers', () => {
  it('maps confidence to the three screens', () => {
    expect(tierFor(0.95)).toBe('high');
    expect(tierFor(0.8)).toBe('high');
    expect(tierFor(0.79)).toBe('medium');
    expect(tierFor(0.5)).toBe('medium');
    expect(tierFor(0.49)).toBe('low');
  });
});

describe('response validation', () => {
  it('rejects a confidence outside 0..1', () => {
    expect(identificationSchema.safeParse({ is_tool: true, tool_type_confidence: 1.4 }).success).toBe(
      false,
    );
  });

  it('fills defaults so a sparse response cannot crash a screen', () => {
    const parsed = identificationSchema.parse({ is_tool: true });
    expect(parsed.alternatives).toEqual([]);
    expect(parsed.model).toBeNull();
    expect(parsed.risk).toBe('low');
  });

  it('refuses a category outside the controlled vocabulary', () => {
    expect(
      identificationSchema.safeParse({ is_tool: true, category: 'spaceships' }).success,
    ).toBe(false);
  });
});
