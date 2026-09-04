/**
 * NailedIt design tokens.
 *
 * One place for colour, type, spacing and radii. Screens never hard-code a hex
 * value or a font size — if a value is needed and isn't here, it belongs here.
 *
 * Two brand colours, and they mean different things:
 *   TEAL  = "get" — needing, borrowing, finding. The primary action.
 *   BLUE  = "give" — listing, offering, messaging. The secondary action.
 * Never swap them for variety. A borrower learns the colour in one session.
 *
 * Amber is semantic only (a rating star, a time-sensitive reminder), red means
 * high risk or destructive. Neither is ever decoration.
 */

const palette = {
  // brand
  teal600: '#00A0AE',
  teal700: '#068693',
  teal500: '#17B4C2',
  teal300: '#6FD3DC',
  teal100: '#D6F1F4',
  teal050: '#EDF9FA',

  blue600: '#1F7FE0',
  blue700: '#1667BC',
  blue300: '#8CBEF2',
  blue100: '#DEEBFB',

  // cool neutrals
  ink900: '#0B121E',
  ink800: '#151C28',
  ink600: '#414A57',
  ink400: '#6B7280',
  ink300: '#8D929C',
  line200: '#E6E8EC',
  line300: '#CBD0D8',
  paper: '#F7F8FA',
  surface: '#FFFFFF',
  surface2: '#EFF1F4',

  // dark surfaces
  darkPaper: '#0C1116',
  darkSurface: '#141A21',
  darkSurface2: '#1D242C',
  darkLine: '#28313A',
  darkLine2: '#3B4650',
  darkInk: '#E7EBF0',
  darkInk2: '#B8C0CA',

  // semantic
  star: '#FDAF33',
  amber: '#9A6206',
  amberSoft: '#FDF0D9',
  amberDark: '#E5A94F',
  amberSoftDark: '#33280F',
  danger: '#C2352A',
  dangerSoft: '#FADEDB',
  dangerDark: '#EE8578',
  dangerSoftDark: '#3A1D1A',

  white: '#FFFFFF',
} as const;

export type ColorScheme = 'light' | 'dark';

/** Every colour role the app can reference. Screens use these, never hexes. */
export type Colors = {
  background: string;
  surface: string;
  surfaceSunken: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  borderStrong: string;
  /** TEAL. Needing, borrowing, finding. */
  accent: string;
  accentText: string;
  accentSoft: string;
  onAccent: string;
  /** BLUE. Offering, listing, messaging. */
  offer: string;
  offerSoft: string;
  onOffer: string;
  star: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  free: string;
  skeleton: string;
};

export const colors: Record<ColorScheme, Colors> = {
  light: {
    background: palette.paper,
    surface: palette.surface,
    surfaceSunken: palette.surface2,
    text: palette.ink900,
    textSecondary: palette.ink600,
    textMuted: palette.ink300,
    border: palette.line200,
    borderStrong: palette.line300,
    accent: palette.teal600,
    accentText: palette.teal700,
    accentSoft: palette.teal100,
    onAccent: palette.white,
    offer: palette.blue600,
    offerSoft: palette.blue100,
    onOffer: palette.white,
    star: palette.star,
    warning: palette.amber,
    warningSoft: palette.amberSoft,
    danger: palette.danger,
    dangerSoft: palette.dangerSoft,
    free: palette.teal600,
    skeleton: palette.surface2,
  },
  dark: {
    background: palette.darkPaper,
    surface: palette.darkSurface,
    surfaceSunken: palette.darkSurface2,
    text: palette.darkInk,
    textSecondary: palette.darkInk2,
    textMuted: palette.ink400,
    border: palette.darkLine,
    borderStrong: palette.darkLine2,
    accent: palette.teal500,
    accentText: palette.teal300,
    accentSoft: '#0C2F35',
    onAccent: '#04171B',
    offer: palette.blue300,
    offerSoft: '#122740',
    onOffer: '#08182B',
    star: palette.star,
    warning: palette.amberDark,
    warningSoft: palette.amberSoftDark,
    danger: palette.dangerDark,
    dangerSoft: palette.dangerSoftDark,
    free: palette.teal300,
    skeleton: palette.darkSurface2,
  },
};

/** 4pt scale. Use these, not arbitrary numbers. */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

/**
 * Type scale. Sizes are deliberately large — the product is designed for
 * 18–75 year olds and "readable at arm's length on a mid-range phone" beats
 * "fits more on screen" every time.
 */
export const type = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: '700' },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700' },
  heading: { fontSize: 19, lineHeight: 25, fontWeight: '600' },
  bodyLarge: { fontSize: 17, lineHeight: 25, fontWeight: '400' },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 23, fontWeight: '600' },
  caption: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.6 },
} as const;

/**
 * Minimum interactive size. Android's guidance is 48dp; we do not go below it
 * anywhere, and primary actions are 56–64.
 */
export const hitSize = {
  min: 48,
  comfortable: 56,
  primary: 64,
} as const;

export const shadow = {
  card: {
    shadowColor: '#0B121E',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  raised: {
    shadowColor: '#0B121E',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
} as const;
