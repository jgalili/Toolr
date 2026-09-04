import { planReminders, type ReminderStrings } from '../src/features/transactions/reminders';

import { tx } from './factories';

const strings: ReminderStrings = {
  dayBeforeTitle: 'day-before',
  dayBeforeBody: (tool) => `before:${tool}`,
  dueTitle: 'due',
  dueBody: (tool) => `due:${tool}`,
  overdueTitle: 'overdue',
  overdueBody: (tool, name) => `overdue:${tool}:${name}`,
  lendingOverdueTitle: 'lending-overdue',
  lendingOverdueBody: (tool, name) => `lending:${tool}:${name}`,
};

const now = new Date('2026-09-08T09:00:00.000Z');

describe('planReminders', () => {
  it('gives a borrower three nudges: the evening before, the due time, and one day late', () => {
    const plan = planReminders([tx({})], strings, now);
    expect(plan.map((p) => p.title)).toEqual(['day-before', 'due', 'overdue']);
    expect(plan[1]?.when.toISOString()).toBe('2026-09-10T18:00:00.000Z');
  });

  it('leaves a lender alone until the tool is actually late', () => {
    const plan = planReminders([tx({ viewerRole: 'owner' })], strings, now);
    expect(plan).toHaveLength(1);
    expect(plan[0]?.title).toBe('lending-overdue');
  });

  it('says nothing about a borrow that is finished', () => {
    expect(planReminders([tx({ status: 'completed' })], strings, now)).toHaveLength(0);
    expect(planReminders([tx({ status: 'returned' })], strings, now)).toHaveLength(0);
  });

  it('never schedules into the past', () => {
    // Due yesterday: the evening-before and due-time nudges have both gone.
    const plan = planReminders([tx({ dueAt: '2026-09-07T18:00:00.000Z' })], strings, now);
    expect(plan.map((p) => p.title)).toEqual(['overdue']);
    expect(plan.every((p) => p.when > now)).toBe(true);
  });

  it('ignores a transaction with an unusable due date rather than throwing', () => {
    expect(planReminders([tx({ dueAt: 'not a date' })], strings, now)).toHaveLength(0);
  });
});
