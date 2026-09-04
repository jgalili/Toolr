import type { Transaction } from '../src/types/domain';

/**
 * A transaction with sensible defaults, so a test can state only the two or
 * three fields it is actually about.
 *
 * Shared rather than copied into each spec: the last time this lived in one
 * test file, adding a field to `Transaction` broke that file and quietly left
 * every other suite constructing a shape the app no longer uses.
 */
export function tx(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 't1',
    requestId: 'r1',
    toolId: 'tool1',
    toolTitle: 'Drill',
    toolPhotoUrl: null,
    ownerId: 'o',
    borrowerId: 'b',
    counterparty: { id: 'o', firstName: 'Daniel', avatarUrl: null, rating: null },
    viewerRole: 'borrower',
    status: 'picked_up',
    agreedTotalAgorot: null,
    currency: 'ILS',
    startAt: null,
    dueAt: '2026-09-10T18:00:00.000Z',
    pickedUpAt: null,
    returnedAt: null,
    ownerConfirmedReturn: false,
    completedAt: null,
    conversationId: null,
    hasRated: false,
    ...over,
  };
}
