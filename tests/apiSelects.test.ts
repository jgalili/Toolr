import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards against a bug that cost three whole features and was invisible from
 * the inside.
 *
 * PostgREST parses `select` as a URL query parameter, not as SQL. A newline
 * anywhere in it is a hard 400 (PGRST100, "failed to parse select parameter"),
 * and supabase-js surfaces that as an ordinary query error -- so React Query
 * caches a rejection, the screen renders its empty state, and everything looks
 * like "there is no data" rather than "the request was malformed".
 *
 * Three selects in live.ts were written as pretty multi-line template
 * literals. Every one of them had been failing since the day it was written:
 * the transactions list (so nothing could ever be marked picked up or
 * returned), the conversations list, and the tool detail extras.
 *
 * Prettier will happily reformat a long string back across lines, which is why
 * this is a test and not a code review note.
 */
const source = readFileSync(join(__dirname, '..', 'src', 'lib', 'api', 'live.ts'), 'utf8');

/** Every `.select(...)` argument, whether a template literal or a quoted string. */
function selectArguments(text: string): { literal: string; line: number }[] {
  const out: { literal: string; line: number }[] = [];
  const pattern = /\.select\(\s*(`[^`]*`|'[^']*'|"[^"]*")/g;
  for (const match of text.matchAll(pattern)) {
    const literal = match[1];
    if (!literal) continue;
    out.push({ literal, line: text.slice(0, match.index ?? 0).split('\n').length });
  }
  return out;
}

/** The comma-separated fields at depth 0, ignoring anything inside an embed. */
function topLevelFields(literal: string): string[] {
  const body = literal.slice(1, -1);
  const fields: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of body) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) fields.push(current.trim());
  return fields;
}

describe('PostgREST select strings', () => {
  const selects = selectArguments(source);

  it('finds the selects at all, so a refactor cannot quietly disarm this test', () => {
    expect(selects.length).toBeGreaterThan(5);
  });

  it.each(selects)('is on a single line (line $line)', ({ literal }) => {
    expect(literal).not.toMatch(/\n/);
  });

  it('never embeds conversations directly on transactions', () => {
    // There is no foreign key between the two -- both point at borrow_requests
    // -- so PostgREST answers 400 (PGRST200). The conversation is reached
    // through the request: borrow_requests(start_at, conversations(id)).
    // Depth matters here: nested inside borrow_requests is the fix, at the top
    // level is the bug, and a plain substring search cannot tell them apart.
    const transactionsSelect = selects.find((s) => s.literal.includes('transactions_owner_id_fkey'));
    expect(transactionsSelect).toBeDefined();

    expect(topLevelFields(transactionsSelect!.literal)).not.toContainEqual(
      expect.stringMatching(/^conversations\(/),
    );
    expect(transactionsSelect!.literal).toMatch(/borrow_requests\([^)]*conversations\(/);
  });
});
