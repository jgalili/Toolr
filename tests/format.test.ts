import {
  AGOROT_PER_UNIT,
  daysBetween,
  formatDistance,
  formatMoney,
  formatRating,
  parseMoneyToAgorot,
} from '@/lib/format';

/** Stand-in for i18next's t(), matching the two distance keys we use. */
const t = (key: string, opts?: Record<string, unknown>) =>
  key === 'common.metres' ? `${opts?.value} m` : `${opts?.value} km`;

describe('money', () => {
  it('is stored in agorot, never floats', () => {
    expect(AGOROT_PER_UNIT).toBe(100);
    expect(parseMoneyToAgorot('15')).toBe(1500);
    expect(parseMoneyToAgorot('15.5')).toBe(1550);
    expect(parseMoneyToAgorot('15,5')).toBe(1550);
  });

  it('rejects nonsense rather than coercing it to zero', () => {
    expect(parseMoneyToAgorot('')).toBeNull();
    expect(parseMoneyToAgorot('abc')).toBeNull();
  });

  it('drops decimals on whole amounts', () => {
    // "₪15/day" reads better than "₪15.00/day".
    expect(formatMoney(1500, 'ILS', 'en')).not.toContain('.00');
    expect(formatMoney(1550, 'ILS', 'en')).toContain('.5');
  });

  it('never renders a float rounding artefact', () => {
    expect(formatMoney(1999, 'ILS', 'en')).toContain('19.99');
  });
});

describe('distance', () => {
  it('rounds to 50 m — the privacy model depends on it', () => {
    // Three precise distances from different points trilaterate a position.
    // Rounded ones do not.
    expect(formatDistance(312, t)).toBe('300 m');
    expect(formatDistance(338, t)).toBe('350 m');
    expect(formatDistance(1, t)).toBe('50 m');
  });

  it('never claims sub-50 m precision', () => {
    for (let m = 1; m < 1000; m += 7) {
      const value = Number(formatDistance(m, t).split(' ')[0]);
      expect(value % 50).toBe(0);
    }
  });

  it('switches to kilometres above 1 km', () => {
    expect(formatDistance(1200, t)).toBe('1.2 km');
    expect(formatDistance(10_000, t)).toBe('10 km');
  });
});

describe('ratings and dates', () => {
  it('shows a dash rather than a fake zero for an unrated user', () => {
    expect(formatRating(null)).toBe('—');
    expect(formatRating(4.87)).toBe('4.9');
  });

  it('counts at least one day — you cannot borrow for zero days', () => {
    const now = new Date('2026-09-01T10:00:00Z').toISOString();
    const soon = new Date('2026-09-01T12:00:00Z').toISOString();
    const later = new Date('2026-09-04T10:00:00Z').toISOString();
    expect(daysBetween(now, soon)).toBe(1);
    expect(daysBetween(now, later)).toBe(3);
  });
});
