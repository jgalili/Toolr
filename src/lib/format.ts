/**
 * Formatting helpers.
 *
 * Two rules this file exists to enforce:
 *   1. Money is agorot (integers) everywhere until the moment it is displayed.
 *   2. Distance is metres everywhere, and is *displayed* rounded — never more
 *      precisely than the server already rounded it to (50 m).
 */

import type { Locale } from '@/i18n';

/** ₪1 = 100 agorot. */
export const AGOROT_PER_UNIT = 100;

const CURRENCY_LOCALE: Record<string, string> = {
  ILS: 'he-IL',
  USD: 'en-US',
  EUR: 'de-DE',
  GBP: 'en-GB',
};

/**
 * Format a money amount held in minor units (agorot).
 * Whole amounts drop the decimals — "₪15/day" reads better than "₪15.00/day".
 */
export function formatMoney(
  minorUnits: number,
  currency: string = 'ILS',
  locale: Locale = 'en',
): string {
  const major = minorUnits / AGOROT_PER_UNIT;
  const hasFraction = minorUnits % AGOROT_PER_UNIT !== 0;
  // he-IL formats shekels with RTL marks around the sign — correct in Hebrew,
  // and visible mojibake in an English sentence ("‏15 ‏₪ / day"). So the number
  // is formatted for the *app's* language, not the currency's home country.
  const intlLocale =
    locale === 'he' ? 'he-IL' : currency === 'ILS' ? 'en-GB' : (CURRENCY_LOCALE[currency] ?? 'en-US');

  try {
    return new Intl.NumberFormat(intlLocale, {
      style: 'currency',
      currency,
      minimumFractionDigits: hasFraction ? 2 : 0,
      maximumFractionDigits: hasFraction ? 2 : 0,
    }).format(major);
  } catch {
    return `${major}`;
  }
}

/** Parse a user-typed price ("15", "15.5") into agorot. Returns null if unusable. */
export function parseMoneyToAgorot(input: string): number | null {
  const cleaned = input.replace(/[^0-9.,]/g, '').replace(',', '.');
  if (cleaned.length === 0) return null;
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * AGOROT_PER_UNIT);
}

/**
 * Human distance. Under 1 km we show metres rounded to 50 — matching what the
 * search RPC already rounds to, so the UI never implies more precision than the
 * privacy model allows. Above 1 km we show one decimal.
 */
export function formatDistance(
  metres: number,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (metres < 1000) {
    const rounded = Math.max(50, Math.round(metres / 50) * 50);
    return t('common.metres', { value: rounded });
  }
  const km = Math.round(metres / 100) / 10;
  return t('common.kilometres', { value: km });
}

/** "500 m" / "3 km" for the radius selector. */
export function formatRadius(
  metres: number,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  return metres < 1000
    ? t('common.metres', { value: metres })
    : t('common.kilometres', { value: metres / 1000 });
}

/** One decimal place, or "—" when there are no ratings yet. */
export function formatRating(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  return value.toFixed(1);
}

export function formatMonthYear(iso: string, locale: Locale = 'en'): string {
  try {
    return new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-GB', {
      month: 'long',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 7);
  }
}

export function formatDayTime(iso: string, locale: Locale = 'en'): string {
  try {
    return new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatTime(iso: string, locale: Locale = 'en'): string {
  try {
    return new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Whole days between two instants, minimum 1 — you can't borrow for zero days. */
export function daysBetween(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.max(1, Math.ceil(ms / 86_400_000));
}

/**
 * "Today" / "tomorrow" / "Thu 12 Sep".
 *
 * Return deadlines are almost always within two days, and "tomorrow by 21:00"
 * is understood instantly where "12/09 21:00" has to be decoded. Anything
 * further out gets the date, because "in 5 days" is not a plan.
 */
export function formatRelativeDay(
  iso: string,
  t: (key: string, opts?: Record<string, unknown>) => string,
  locale: Locale = 'en',
): string {
  const target = new Date(iso);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(target) - startOfDay(new Date())) / 86_400_000);

  if (days === 0) return t('chat.today');
  if (days === 1) return t('chat.tomorrow');
  try {
    return new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(target);
  } catch {
    return iso.slice(0, 10);
  }
}
