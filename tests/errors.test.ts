import { describeError } from '../src/features/feedback/errors';
import en from '../src/i18n/locales/en.json';

/**
 * The regression these tests exist for: `respond_to_request` returned
 *
 *   { code: '22023', message: 'That return time has already passed' }
 *
 * and the Accept button did nothing visible. Whatever else changes, that error
 * must arrive as a sentence and must point at the control that fixes it.
 */
const RETURN_PASSED = {
  code: '22023',
  message: 'That return time has already passed',
  details: null,
  hint: 'adjust_return',
};

describe('describeError', () => {
  it('turns the real accept failure into an actionable message', () => {
    const described = describeError(RETURN_PASSED);
    expect(described.key).toBe('returnTimePassed');
    expect(described.action).toBe('adjustReturn');
  });

  it('keeps the raw text for logs and off the screen', () => {
    expect(describeError(RETURN_PASSED).raw).toContain('already passed');
  });

  it('never invents a key the app cannot translate', () => {
    const errors = Object.keys(en.errors);
    const samples: unknown[] = [
      RETURN_PASSED,
      { code: '22023', message: 'The return has to be after the pickup' },
      { code: '22023', message: 'That request has already been answered' },
      { code: '42501', message: 'Only the owner can answer this request' },
      { code: '42501', message: 'Not your transaction' },
      { code: '42501', message: 'not_your_tool' },
      { code: 'P0002', message: 'Request not found' },
      { code: 'P0002', message: 'That tool is not available' },
      { code: '23505', message: 'You already have a pending request for this tool' },
      { code: '22023', message: 'You cannot borrow your own tool' },
      { code: '22023', message: 'That borrow is already finished' },
      { code: '22023', message: 'That borrow is no longer waiting to be picked up' },
      { code: '22023', message: 'You can rate once the tool is back' },
      { code: '22023', message: 'High-risk tools need a safety acknowledgement' },
      { code: '22023', message: 'A rental needs a price per day' },
      { code: '22023', message: 'A name needs to be 1-40 characters' },
      { code: '42501', message: 'Sign in to send a borrow request' },
      new TypeError('Failed to fetch'),
      {},
      null,
      'something odd',
    ];
    for (const sample of samples) {
      const { key } = describeError(sample);
      expect(errors).toContain(key);
    }
  });

  it('does not blame the user for our own malformed query', () => {
    // PGRST100 (unparseable select) and PGRST200 (embed across a missing FK)
    // both shipped here and emptied four screens. They are bugs, not refusals.
    for (const code of ['PGRST100', 'PGRST200']) {
      const described = describeError({ code, message: '"failed to parse select parameter"' });
      expect(described.key).toBe('generic');
      expect(described.raw).toContain(code);
    }
  });

  it('tells a refusal apart from a dropped connection', () => {
    expect(describeError(new TypeError('Failed to fetch')).key).toBe('offline');
    expect(describeError({ code: '42501', message: 'Not your transaction' }).key).not.toBe('offline');
  });

  it('only offers to change the date when the date is the problem', () => {
    expect(describeError({ code: '22023', message: 'That request has already been answered' }).action)
      .toBeNull();
    expect(describeError({ code: 'P0002', message: 'Request not found' }).action).toBeNull();
  });

  it('survives an error with no message at all', () => {
    expect(describeError(undefined).key).toBe('generic');
    expect(describeError({}).key).toBe('generic');
  });
});
