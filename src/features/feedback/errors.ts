/**
 * What the server said, in a sentence a person can act on.
 *
 * The single most common bug in this app has not been a broken button — it has
 * been a working button whose failure went nowhere. `respond_to_request` was
 * returning a considered, specific 400 ("that return time has already passed")
 * and the Accept button simply sat there, because the mutation's error was
 * never rendered. From the outside that is indistinguishable from a dead
 * button, which is exactly how it was reported.
 *
 * So this module exists to turn a server error into three things:
 *   - a translation key, because a raw Postgres message is not an apology;
 *   - an optional `action`, because "your date is in the past" is only useful
 *     next to the control that changes the date;
 *   - the raw text, which goes to analytics and never to the screen.
 *
 * The message table below is not guesswork: every string in it is raised by an
 * RPC in supabase/migrations, so the vocabulary is closed and ours. Matching on
 * the message rather than the SQLSTATE is deliberate — half of these are
 * errcode 22023, which on its own means only "the server refused".
 */

/** Something the UI can offer to do about it, beyond "try again". */
export type ErrorAction = 'adjustReturn' | 'signIn' | null;

export type DescribedError = {
  /** i18n key under `errors.` */
  key: string;
  action: ErrorAction;
  /** For analytics and logs. Never rendered. */
  raw: string;
};

type Rule = { match: RegExp; key: string; action?: ErrorAction };

const RULES: Rule[] = [
  // The one that started this. Only reachable on accept, and the fix is one tap away.
  { match: /return time has already passed/i, key: 'returnTimePassed', action: 'adjustReturn' },
  { match: /return has to be after the pickup/i, key: 'returnBeforePickup', action: 'adjustReturn' },

  { match: /request has already been answered/i, key: 'alreadyAnswered' },
  { match: /only the owner can answer/i, key: 'notYourRequest' },
  { match: /already have a pending request/i, key: 'alreadyRequested' },
  { match: /cannot borrow your own tool/i, key: 'ownTool' },
  { match: /tool is not available/i, key: 'toolUnavailable' },
  { match: /out on loan right now/i, key: 'toolOnLoan' },
  { match: /borrow is already finished/i, key: 'loanFinished' },
  { match: /no longer waiting to be picked up/i, key: 'notAwaitingPickup' },
  { match: /rate once the tool is back/i, key: 'rateLater' },
  { match: /not your transaction|not_your_tool/i, key: 'notYours' },
  { match: /safety acknowledgement/i, key: 'needsSafety' },
  { match: /needs a price per day/i, key: 'needsPrice' },
  { match: /name needs to be/i, key: 'badName' },

  { match: /sign in|signed-in/i, key: 'signInRequired', action: 'signIn' },
  { match: /not found/i, key: 'notFound' },

  // Network, not refusal. Worth its own sentence because the remedy is different.
  { match: /failed to fetch|network request failed|networkerror/i, key: 'offline' },
];

/** SQLSTATEs that are meaningful even when the message is not one of ours. */
const CODES: Record<string, string> = {
  '42501': 'notYours',
  P0002: 'notFound',
  '23505': 'alreadyExists',
};

function textOf(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  const e = error as { message?: unknown; details?: unknown; hint?: unknown };
  return [e.message, e.details, e.hint].filter((p) => typeof p === 'string').join(' — ');
}

function codeOf(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : '';
}

/**
 * A PostgREST 400 about the *shape* of a query is our bug, not the person's.
 * PGRST100 (unparseable select) and PGRST200 (embed across a missing FK) both
 * shipped in this app and turned four screens into silent empty states; if one
 * ever comes back it should read as a fault, not as a refusal aimed at the user.
 */
function isOurBug(code: string): boolean {
  return code.startsWith('PGRST');
}

export function describeError(error: unknown): DescribedError {
  const raw = textOf(error);
  const code = codeOf(error);

  if (isOurBug(code)) return { key: 'generic', action: null, raw: `${code} ${raw}`.trim() };

  for (const rule of RULES) {
    if (rule.match.test(raw)) return { key: rule.key, action: rule.action ?? null, raw };
  }

  const byCode = CODES[code];
  if (byCode) return { key: byCode, action: byCode === 'signInRequired' ? 'signIn' : null, raw };

  return { key: 'generic', action: null, raw };
}
