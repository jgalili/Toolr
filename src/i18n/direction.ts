import { I18nManager } from 'react-native';

import type { IconName } from '@/components/domain/Icon';

/**
 * Direction-aware glyphs.
 *
 * Logical layout properties (`marginStart`, `start`, `end`) handle boxes, and
 * the codebase uses only those. What they do NOT handle is *content* that
 * points somewhere: a back arrow, a disclosure chevron, a "next" caret. Those
 * have to be mirrored explicitly, and forgetting is the single most common RTL
 * defect — a Hebrew screen with a left-pointing "back" arrow reads as "forward".
 *
 * `I18nManager.isRTL` is read at call time rather than captured, because it
 * changes when the app is relaunched after a language switch.
 */

export function isRTLLayout(): boolean {
  return I18nManager.isRTL;
}

/** "Go back" — points the way the user came from. */
export const backArrow = (): string => (I18nManager.isRTL ? '→' : '←');

/** Disclosure chevron on a list row — points the way the row opens. */
export const chevron = (): string => (I18nManager.isRTL ? '‹' : '›');

/** Forward caret, e.g. a "next step" affordance. */
export const forwardArrow = (): string => (I18nManager.isRTL ? '←' : '→');

/**
 * Mirror a horizontal offset. Useful for the rare absolute position that has
 * to move with direction and cannot use `start`/`end`.
 */
export function mirror(value: number): number {
  return I18nManager.isRTL ? -value : value;
}

/**
 * The same three glyphs as drawn icons.
 *
 * Text arrows are still used where the label *is* the arrow (a compact
 * breadcrumb); anywhere the app draws an icon it should use these, so a Hebrew
 * back button points right like every other Hebrew back button.
 */
export const backIcon = (): IconName => (I18nManager.isRTL ? 'arrow-right' : 'arrow-left');

export const chevronIcon = (): IconName =>
  I18nManager.isRTL ? 'chevron-left' : 'chevron-right';

export const backChevronIcon = (): IconName =>
  I18nManager.isRTL ? 'chevron-right' : 'chevron-left';
