import { formatDateRange, formatShortDate } from '@/lib/format';
import type { Locale } from '@/i18n';
import type { ReservedWindow, Transaction } from '@/types/domain';

/**
 * What is happening with this tool, in one line.
 *
 * Every screen that shows a tool asks the same question — is it here, is it
 * spoken for, is someone holding it, am I waiting to get it back — and before
 * this they each answered it slightly differently, or not at all. So the answer
 * is computed once, here, and the screens only decide where to put it.
 *
 * Returns an i18n key plus its values rather than a finished string. That keeps
 * the whole thing pure and testable without mounting a component or booting
 * i18next, and it keeps Hebrew working: a sentence assembled from fragments in
 * the caller is a sentence that only reads correctly in English.
 *
 * The vocabulary is deliberately four words, not six:
 *
 *   RESERVED  the dates are promised, the tool is still here and still lendable
 *   BORROWED  it has physically gone
 *   RETURNED  the borrower says it is back; the owner has not agreed yet
 *   OVERDUE   any of the above, past its return time
 *
 * "Reserved" and "Borrowed" being different words is the whole point. Calling an
 * accepted request "borrowed" is what made people go looking for a tool that was
 * still sitting in the owner's cupboard.
 */

export type LoanTone = 'muted' | 'accent' | 'danger';

export type LoanLine = {
  key: string;
  values: Record<string, string>;
  tone: LoanTone;
};

/** The states worth showing. Anything else is history, and history is not a badge. */
export function isLiveLoan(tx: Transaction): boolean {
  return tx.status === 'agreed' || tx.status === 'picked_up' || tx.status === 'returned';
}

/**
 * Index the viewer's own transactions by tool.
 *
 * A tool can have more than one live loan — last week's return that is still
 * waiting on a confirmation, and next Tuesday's reservation. The one worth
 * putting on the card is the one that needs attention soonest, so: anything
 * overdue first, then whatever is physically out, then the nearest date.
 */
export function loansByTool(transactions: Transaction[], now: Date = new Date()): Map<string, Transaction> {
  const rank = (tx: Transaction): number => {
    if (new Date(tx.dueAt).getTime() < now.getTime() && tx.status !== 'returned') return 0;
    if (tx.status === 'returned') return 1;
    if (tx.status === 'picked_up') return 2;
    return 3;
  };

  const out = new Map<string, Transaction>();
  for (const tx of transactions) {
    if (!isLiveLoan(tx)) continue;
    const held = out.get(tx.toolId);
    if (!held) {
      out.set(tx.toolId, tx);
      continue;
    }
    const better =
      rank(tx) < rank(held) ||
      (rank(tx) === rank(held) && new Date(tx.dueAt).getTime() < new Date(held.dueAt).getTime());
    if (better) out.set(tx.toolId, tx);
  }
  return out;
}

/**
 * The line for a loan the viewer is part of.
 *
 * `role` comes off the transaction rather than being passed in, because the
 * server already decided which side the viewer is on and a screen that decides
 * it again is a screen that can decide it wrongly.
 */
export function loanLine(
  tx: Transaction,
  locale: Locale = 'en',
  now: Date = new Date(),
): LoanLine {
  const name = tx.counterparty.firstName;
  const due = formatShortDate(tx.dueAt, locale);
  const overdue = new Date(tx.dueAt).getTime() < now.getTime();

  if (tx.viewerRole === 'owner') {
    if (tx.status === 'returned') {
      return { key: 'loan.ownerAwaitingConfirm', values: { name }, tone: 'accent' };
    }
    if (tx.status === 'picked_up') {
      return overdue
        ? { key: 'loan.ownerOverdue', values: { name, when: due }, tone: 'danger' }
        : { key: 'loan.ownerLent', values: { name, when: due }, tone: 'muted' };
    }
    // Reserved. The dates matter more than the deadline — nothing is late yet.
    return {
      key: 'loan.ownerReserved',
      values: { name, when: reservedWhen(tx, locale) },
      tone: 'muted',
    };
  }

  if (tx.status === 'returned') {
    return { key: 'loan.borrowerReturned', values: { name }, tone: 'muted' };
  }
  if (tx.status === 'picked_up') {
    return overdue
      ? { key: 'loan.borrowerOverdue', values: { name, when: due }, tone: 'danger' }
      : { key: 'loan.borrowerHas', values: { name, when: due }, tone: 'accent' };
  }
  return {
    key: 'loan.borrowerReserved',
    values: { name, when: reservedWhen(tx, locale) },
    tone: 'muted',
  };
}

function reservedWhen(tx: Transaction, locale: Locale): string {
  return tx.startAt
    ? formatDateRange(tx.startAt, tx.dueAt, locale)
    : formatShortDate(tx.dueAt, locale);
}

/**
 * The line a stranger sees on a tool that is spoken for.
 *
 * Dates only, and no name: whose drill it is is already on the card, but who
 * borrowed it is nobody else's business. A window that has already started and
 * is out of the house is not shown at all, because that tool is not in search
 * to begin with.
 */
export function publicReservedLine(
  windows: ReservedWindow[],
  locale: Locale = 'en',
  now: Date = new Date(),
): LoanLine | null {
  const upcoming = windows
    .filter((w) => !w.isOut && new Date(w.endAt).getTime() > now.getTime())
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

  const next = upcoming[0];
  if (!next) return null;
  return {
    key: 'loan.publicReserved',
    values: { when: formatDateRange(next.startAt, next.endAt, locale) },
    tone: 'muted',
  };
}

/** Group public windows by tool, so a list of cards is one lookup each. */
export function windowsByTool(windows: ReservedWindow[]): Map<string, ReservedWindow[]> {
  const out = new Map<string, ReservedWindow[]>();
  for (const w of windows) {
    const list = out.get(w.toolId);
    if (list) list.push(w);
    else out.set(w.toolId, [w]);
  }
  return out;
}

/**
 * Whose turn is it, and what is the button called?
 *
 * One next step per state per side, so no screen has to work it out for itself
 * and no two screens can disagree about it. `null` means there is nothing for
 * this person to do right now, which is a real and common answer.
 */
export type LoanAction = { key: string; action: 'pickup' | 'return' | 'confirmReturn' | 'rate' };

export function nextAction(tx: Transaction): LoanAction | null {
  const owner = tx.viewerRole === 'owner';

  if (tx.status === 'agreed') {
    // Either side may record the handover — whoever has the phone out wins.
    return { key: owner ? 'loan.handedOver' : 'transaction.iPickedItUp', action: 'pickup' };
  }
  if (tx.status === 'picked_up') {
    return owner
      ? { key: 'loan.gotItBack', action: 'confirmReturn' }
      : { key: 'loan.iReturnedIt', action: 'return' };
  }
  if (tx.status === 'returned') {
    // The borrower has said it is back. Until the owner agrees, the owner's
    // only job is to agree; the borrower's is to rate and move on.
    if (owner && !tx.ownerConfirmedReturn) return { key: 'loan.gotItBack', action: 'confirmReturn' };
    if (!tx.hasRated) return { key: 'rating.title', action: 'rate' };
  }
  return null;
}
