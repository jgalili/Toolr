import { demoSource } from '@/lib/api/demo';
import { FLORENTIN } from '@/demo/seed';
import { DEFAULT_FILTERS } from '@/types/domain';

const base = { ...DEFAULT_FILTERS, centre: FLORENTIN };

describe('nearby search', () => {
  it('never returns a tool outside the radius', async () => {
    const results = await demoSource.searchTools({ ...base, radiusM: 500 });
    expect(results.length).toBeGreaterThan(0);
    for (const tool of results) expect(tool.distanceM).toBeLessThanOrEqual(500);
  });

  it('returns every distance pre-rounded to 50 m', async () => {
    const results = await demoSource.searchTools({ ...base, radiusM: 10_000 });
    for (const tool of results) expect(tool.distanceM % 50).toBe(0);
  });

  it('honours the free-only filter', async () => {
    const results = await demoSource.searchTools({ ...base, radiusM: 10_000, freeOnly: true });
    expect(results.length).toBeGreaterThan(0);
    for (const tool of results) expect(tool.paymentMode).toBe('free');
  });

  it('ranks closer and free tools first', async () => {
    const results = await demoSource.searchTools({ ...base, radiusM: 10_000 });
    expect(results[0]!.distanceM).toBeLessThan(results[results.length - 1]!.distanceM);
  });

  it('interprets a described job, not just a tool name', async () => {
    const interpretation = await demoSource.interpretQuery(
      'I need to make a hole in a concrete wall',
      'en',
    );
    expect(interpretation?.tool_types).toContain('rotary-hammer');
  });

  it('returns null for a query it cannot interpret, so search degrades to keywords', async () => {
    expect(await demoSource.interpretQuery('zzzz', 'en')).toBeNull();
  });
});

describe('pickup location', () => {
  it('is withheld until a transaction exists and is at least agreed', async () => {
    expect(await demoSource.getPickupLocation('does-not-exist')).toBeNull();
  });

  it('is released for an accepted transaction', async () => {
    const location = await demoSource.getPickupLocation('x-1');
    expect(location?.addressLine).toBeTruthy();
  });
});

describe('demo identification', () => {
  it('never returns a model below the confidence threshold', async () => {
    const outcome = await demoSource.identifyTool('file://photo.jpg');
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.identification.model_confidence).toBeLessThan(0.7);
      expect(outcome.identification.model).toBeNull();
    }
  });
});
