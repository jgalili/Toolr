import { buildPatch, hasChanges, validate, type EditableListing } from '../src/features/listing/toolPatch';

const ORIGINAL: EditableListing = {
  title: 'Creality Ender 3',
  description: 'A 3D printer, works well.',
  accessories: 'Spare nozzle',
  instructions: 'Level the bed first.',
  maxBorrowDays: 7,
  isFree: false,
  pricePerDayAgorot: 1500,
  availabilityMode: 'now',
};

const edit = (changes: Partial<EditableListing>): EditableListing => ({ ...ORIGINAL, ...changes });

describe('buildPatch', () => {
  it('sends nothing when nothing changed', () => {
    expect(buildPatch(ORIGINAL, edit({}))).toEqual({});
    expect(hasChanges(buildPatch(ORIGINAL, edit({})))).toBe(false);
  });

  it('sends ONLY the field that changed', () => {
    // The bug this is here to prevent: an edit screen that posts its whole
    // model wipes every field the screen does not happen to show.
    expect(buildPatch(ORIGINAL, edit({ availabilityMode: 'ask' }))).toEqual({
      availabilityMode: 'ask',
    });
  });

  it('changes the price and the free flag together, never one alone', () => {
    // The server refuses "rent, no price" — rightly — and a half-patch would
    // make that refusal look like a broken Save button.
    const patch = buildPatch(ORIGINAL, edit({ pricePerDayAgorot: 2000 }));
    expect(patch).toEqual({ isFree: false, pricePerDayAgorot: 2000 });
  });

  it('clears the price when a listing becomes free', () => {
    expect(buildPatch(ORIGINAL, edit({ isFree: true }))).toEqual({
      isFree: true,
      pricePerDayAgorot: null,
    });
  });

  it('carries a price when a free listing starts charging', () => {
    const free = edit({ isFree: true, pricePerDayAgorot: null });
    expect(buildPatch(free, edit({ isFree: false, pricePerDayAgorot: 800 }))).toEqual({
      isFree: false,
      pricePerDayAgorot: 800,
    });
  });

  it('treats an emptied text box as clearing the field, not as ""', () => {
    const patch = buildPatch(ORIGINAL, edit({ instructions: '   ' }));
    expect(patch).toEqual({ instructions: null });
    expect('instructions' in patch).toBe(true);
  });

  it('does not report a change when only whitespace differs', () => {
    expect(buildPatch(ORIGINAL, edit({ description: '  A 3D printer, works well.  ' }))).toEqual({});
  });

  it('refuses to blank a title, because there is no such listing', () => {
    expect(buildPatch(ORIGINAL, edit({ title: '   ' }))).toEqual({});
  });

  it('can take the ceiling off max borrow days', () => {
    expect(buildPatch(ORIGINAL, edit({ maxBorrowDays: null }))).toEqual({ maxBorrowDays: null });
  });

  it('keeps several real changes in one patch', () => {
    const patch = buildPatch(
      ORIGINAL,
      edit({ title: 'Creality Ender 3 V2', isFree: true, availabilityMode: 'ask' }),
    );
    expect(patch).toEqual({
      title: 'Creality Ender 3 V2',
      isFree: true,
      pricePerDayAgorot: null,
      availabilityMode: 'ask',
    });
  });
});

describe('validate', () => {
  it('will not let a rental be saved without a price', () => {
    expect(validate(edit({ isFree: false, pricePerDayAgorot: null }))).toBe('needsPrice');
    expect(validate(edit({ isFree: false, pricePerDayAgorot: 0 }))).toBe('needsPrice');
  });

  it('is happy with a free listing that has no price', () => {
    expect(validate(edit({ isFree: true, pricePerDayAgorot: null }))).toBeNull();
  });

  it('wants a title', () => {
    expect(validate(edit({ title: 'x' }))).toBe('needsTitle');
    expect(validate(ORIGINAL)).toBeNull();
  });
});
