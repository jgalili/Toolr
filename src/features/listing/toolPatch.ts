/**
 * What actually changed on the edit screen.
 *
 * The obvious implementation of an edit screen — read the form, send the whole
 * model — is wrong here in two separate ways, and both of them destroy data
 * rather than merely annoying somebody:
 *
 *   1. The screen does not show every field. Anything it omits would be sent
 *      as undefined and, on the server, read as "clear it".
 *   2. `undefined` and `null` mean different things over the wire. Absent is
 *      "leave it"; null is "empty this field on purpose". Collapse the two and
 *      an edit that only changed the price also wipes the instructions.
 *
 * So this compares the form against what was loaded and emits ONLY the keys
 * that differ. It is a pure function on purpose: it is the part of editing
 * that can silently lose someone's work, so it is the part that gets tested
 * without a screen, a network, or a database in the way.
 */

import type { ToolPatch } from '@/lib/api/types';
import type { ToolDetail } from '@/types/domain';

/** The subset of a listing the edit screen can change. */
export type EditableListing = {
  title: string;
  description: string | null;
  accessories: string | null;
  instructions: string | null;
  maxBorrowDays: number | null;
  isFree: boolean;
  pricePerDayAgorot: number | null;
  availabilityMode: 'now' | 'dates' | 'ask';
};

export function editableFrom(tool: ToolDetail): EditableListing {
  return {
    title: tool.title,
    description: tool.description,
    accessories: tool.accessories,
    instructions: tool.instructions,
    maxBorrowDays: tool.maxBorrowDays,
    isFree: tool.paymentMode === 'free',
    pricePerDayAgorot: tool.pricePerDayAgorot,
    availabilityMode: tool.availabilityMode,
  };
}

/** Empty text from a form field is an empty field, not the string "". */
function normaliseText(value: string | null): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function buildPatch(original: EditableListing, next: EditableListing): ToolPatch {
  const patch: ToolPatch = {};

  const title = next.title.trim();
  if (title.length > 0 && title !== original.title) patch.title = title;

  for (const key of ['description', 'accessories', 'instructions'] as const) {
    const value = normaliseText(next[key]);
    if (value !== normaliseText(original[key])) patch[key] = value;
  }

  if (next.maxBorrowDays !== original.maxBorrowDays) patch.maxBorrowDays = next.maxBorrowDays;
  if (next.availabilityMode !== original.availabilityMode) {
    patch.availabilityMode = next.availabilityMode;
  }

  // Price and free-ness travel together or not at all. Sending one without the
  // other is how a listing ends up "rent" with no price, which the server
  // refuses — correctly, but the person only sees a save that failed.
  const priceChanged = next.pricePerDayAgorot !== original.pricePerDayAgorot;
  if (next.isFree !== original.isFree || (!next.isFree && priceChanged)) {
    patch.isFree = next.isFree;
    patch.pricePerDayAgorot = next.isFree ? null : next.pricePerDayAgorot;
  }

  return patch;
}

/** Nothing to send means nothing to save — and no spinner, and no toast. */
export function hasChanges(patch: ToolPatch): boolean {
  return Object.keys(patch).length > 0;
}

/**
 * Whether the form is in a state the server would accept, checked here so the
 * Save button can be disabled rather than the person discovering it by tapping.
 */
export function validate(next: EditableListing): 'needsPrice' | 'needsTitle' | null {
  if (next.title.trim().length < 2) return 'needsTitle';
  if (!next.isFree && (next.pricePerDayAgorot == null || next.pricePerDayAgorot <= 0)) {
    return 'needsPrice';
  }
  return null;
}
