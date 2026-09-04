import {
  loanLine,
  loansByTool,
  nextAction,
  publicReservedLine,
} from '../src/features/transactions/loanState';
import { formatDateRange } from '../src/lib/format';

import { tx } from './factories';

const now = new Date('2026-09-12T09:00:00.000Z');

/**
 * The month as this runtime's ICU spells it ("Sep" on some versions, "Sept" on
 * others). Pinning the spelling would make these tests about Node's data
 * tables; what is under test is the collapsing, the ordering and the wording.
 */
const SEP = new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(new Date('2026-09-12'));
const OCT = new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(new Date('2026-10-02'));

describe('loanLine', () => {
  it('calls an accepted request RESERVED, not borrowed, and shows the dates', () => {
    const line = loanLine(
      tx({
        viewerRole: 'borrower',
        status: 'agreed',
        startAt: '2026-09-15T16:00:00.000Z',
        dueAt: '2026-09-17T18:00:00.000Z',
      }),
      'en',
      now,
    );
    expect(line.key).toBe('loan.borrowerReserved');
    expect(line.values.when).toBe(`15–17 ${SEP}`);
    // Nothing is late about a reservation for next week.
    expect(line.tone).toBe('muted');
  });

  it('tells the owner who has it and when it is due once it is out', () => {
    const line = loanLine(
      tx({ viewerRole: 'owner', status: 'picked_up', dueAt: '2026-09-14T18:00:00.000Z' }),
      'en',
      now,
    );
    expect(line).toEqual({
      key: 'loan.ownerLent',
      values: { name: 'Daniel', when: `14 ${SEP}` },
      tone: 'muted',
    });
  });

  it('tells the borrower where it came from and when it goes back', () => {
    const line = loanLine(
      tx({ viewerRole: 'borrower', status: 'picked_up', dueAt: '2026-09-14T18:00:00.000Z' }),
      'en',
      now,
    );
    expect(line.key).toBe('loan.borrowerHas');
    expect(line.values).toEqual({ name: 'Daniel', when: `14 ${SEP}` });
  });

  it('goes red once the return time has passed', () => {
    const late = tx({ status: 'picked_up', dueAt: '2026-09-10T18:00:00.000Z' });
    expect(loanLine({ ...late, viewerRole: 'borrower' }, 'en', now)).toMatchObject({
      key: 'loan.borrowerOverdue',
      tone: 'danger',
    });
    expect(loanLine({ ...late, viewerRole: 'owner' }, 'en', now)).toMatchObject({
      key: 'loan.ownerOverdue',
      tone: 'danger',
    });
  });

  it('asks the owner to confirm once the borrower says it is back', () => {
    const line = loanLine(tx({ viewerRole: 'owner', status: 'returned' }), 'en', now);
    expect(line.key).toBe('loan.ownerAwaitingConfirm');
    // Not danger: nothing is wrong, someone just has to press a button.
    expect(line.tone).toBe('accent');
  });

  it('does not call a returned loan overdue just because the date passed', () => {
    const line = loanLine(
      tx({ viewerRole: 'borrower', status: 'returned', dueAt: '2026-09-01T18:00:00.000Z' }),
      'en',
      now,
    );
    expect(line.key).toBe('loan.borrowerReturned');
    expect(line.tone).not.toBe('danger');
  });
});

describe('nextAction', () => {
  it('lets either side record the handover, wording it from their side', () => {
    expect(nextAction(tx({ status: 'agreed', viewerRole: 'owner' }))).toEqual({
      key: 'loan.handedOver',
      action: 'pickup',
    });
    expect(nextAction(tx({ status: 'agreed', viewerRole: 'borrower' }))).toEqual({
      key: 'transaction.iPickedItUp',
      action: 'pickup',
    });
  });

  it('offers the borrower "I returned it" and the owner "Got it back"', () => {
    expect(nextAction(tx({ status: 'picked_up', viewerRole: 'borrower' }))).toEqual({
      key: 'loan.iReturnedIt',
      action: 'return',
    });
    expect(nextAction(tx({ status: 'picked_up', viewerRole: 'owner' }))).toEqual({
      key: 'loan.gotItBack',
      action: 'confirmReturn',
    });
  });

  it('keeps asking the owner to confirm after the borrower has said it is back', () => {
    expect(
      nextAction(tx({ status: 'returned', viewerRole: 'owner', ownerConfirmedReturn: false })),
    ).toEqual({ key: 'loan.gotItBack', action: 'confirmReturn' });
  });

  it('moves on to rating once the owner has confirmed', () => {
    expect(
      nextAction(tx({ status: 'returned', viewerRole: 'owner', ownerConfirmedReturn: true })),
    ).toEqual({ key: 'rating.title', action: 'rate' });
    expect(
      nextAction(
        tx({ status: 'returned', viewerRole: 'owner', ownerConfirmedReturn: true, hasRated: true }),
      ),
    ).toBeNull();
  });

  it('has nothing to ask of anyone once the loan is finished', () => {
    expect(nextAction(tx({ status: 'completed', hasRated: true }))).toBeNull();
  });
});

describe('loansByTool', () => {
  it('shows the overdue loan rather than a reservation further out', () => {
    const overdue = tx({
      id: 'late',
      status: 'picked_up',
      dueAt: '2026-09-05T18:00:00.000Z',
    });
    const upcoming = tx({
      id: 'soon',
      status: 'agreed',
      dueAt: '2026-09-20T18:00:00.000Z',
    });
    expect(loansByTool([upcoming, overdue], now).get('tool1')?.id).toBe('late');
  });

  it('ignores finished loans entirely', () => {
    const map = loansByTool([tx({ status: 'completed' }), tx({ status: 'cancelled' })], now);
    expect(map.size).toBe(0);
  });
});

describe('publicReservedLine', () => {
  const window = (over: Partial<{ startAt: string; endAt: string; isOut: boolean }>) => ({
    toolId: 'tool1',
    startAt: '2026-09-15T16:00:00.000Z',
    endAt: '2026-09-17T18:00:00.000Z',
    isOut: false,
    ...over,
  });

  it('names the dates and nobody else', () => {
    const line = publicReservedLine([window({})], 'en', now);
    expect(line).toEqual({
      key: 'loan.publicReserved',
      values: { when: `15–17 ${SEP}` },
      tone: 'muted',
    });
    // Whoever borrowed it is not this function's business.
    expect(JSON.stringify(line)).not.toMatch(/name/);
  });

  it('picks the soonest window still ahead of us', () => {
    const line = publicReservedLine(
      [
        window({ startAt: '2026-09-25T16:00:00.000Z', endAt: '2026-09-26T18:00:00.000Z' }),
        window({ startAt: '2026-09-15T16:00:00.000Z', endAt: '2026-09-17T18:00:00.000Z' }),
      ],
      'en',
      now,
    );
    expect(line?.values.when).toBe(`15–17 ${SEP}`);
  });

  it('says nothing about a tool that is already out, or about the past', () => {
    expect(publicReservedLine([window({ isOut: true })], 'en', now)).toBeNull();
    expect(
      publicReservedLine(
        [window({ startAt: '2026-09-01T16:00:00.000Z', endAt: '2026-09-03T18:00:00.000Z' })],
        'en',
        now,
      ),
    ).toBeNull();
  });
});

describe('formatDateRange', () => {
  it('writes the month once when both ends share it', () => {
    expect(formatDateRange('2026-09-12T09:00:00Z', '2026-09-14T09:00:00Z', 'en')).toBe(
      `12–14 ${SEP}`,
    );
  });

  it('writes both months when they differ', () => {
    expect(formatDateRange('2026-09-29T09:00:00Z', '2026-10-02T09:00:00Z', 'en')).toBe(
      `29 ${SEP} – 2 ${OCT}`,
    );
  });

  it('collapses a same-day borrow to one date', () => {
    expect(formatDateRange('2026-09-12T09:00:00Z', '2026-09-12T18:00:00Z', 'en')).toBe(
      `12 ${SEP}`,
    );
  });
});
