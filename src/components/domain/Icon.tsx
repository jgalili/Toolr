import React from 'react';
import type { ColorValue } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

/**
 * The whole icon set, in one file, drawn on a 24×24 grid.
 *
 * Deliberately not an icon library: the app ships 30-odd glyphs and a
 * dependency would cost more kilobytes than the glyphs do. Every icon is a
 * 2px stroke on 24×24 so they sit together without anyone nudging sizes.
 *
 * `filled` variants exist only where a tab or a toggle needs a solid state.
 */

export type IconName =
  | 'home'
  | 'search'
  | 'plus-circle'
  | 'message'
  | 'person'
  | 'bell'
  | 'pin'
  | 'star'
  | 'clock'
  | 'sliders'
  | 'calendar'
  | 'shield-check'
  | 'chevron-right'
  | 'chevron-left'
  | 'arrow-left'
  | 'arrow-right'
  | 'heart'
  | 'pencil'
  | 'check-circle'
  | 'question-circle'
  | 'info'
  | 'list'
  | 'map'
  | 'more'
  | 'send'
  | 'camera'
  | 'plus'
  | 'check'
  | 'tag'
  | 'battery'
  | 'charger'
  | 'case'
  | 'chevron-down'
  | 'ticks';

/** Glyphs that read as solid shapes rather than outlines when `filled`. */
const FILLABLE = new Set<IconName>(['home', 'star', 'heart', 'plus-circle', 'message', 'bell', 'pin']);

const GLYPHS: Record<IconName, React.ReactNode> = {
  home: <Path d="M3 11.4 12 4l9 7.4V19a2 2 0 0 1-2 2h-4v-6H9v6H5a2 2 0 0 1-2-2z" />,
  search: (
    <>
      <Circle cx="11" cy="11" r="6.5" />
      <Path d="m16 16 4.5 4.5" />
    </>
  ),
  'plus-circle': (
    <>
      <Circle cx="12" cy="12" r="8.5" />
      <Path d="M12 8.5v7M8.5 12h7" />
    </>
  ),
  message: (
    <>
      <Path d="M21 12a8 8 0 0 1-8 8H4.8a.8.8 0 0 1-.62-1.3L5.6 17A8 8 0 1 1 21 12z" />
      <Circle cx="8.6" cy="12" r=".9" />
      <Circle cx="12" cy="12" r=".9" />
      <Circle cx="15.4" cy="12" r=".9" />
    </>
  ),
  person: (
    <>
      <Circle cx="12" cy="8" r="3.6" />
      <Path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" />
    </>
  ),
  bell: (
    <>
      <Path d="M18 15.5V11a6 6 0 1 0-12 0v4.5L4.6 18h14.8z" />
      <Path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  pin: (
    <>
      <Path d="M12 21.5S5 15.6 5 10.5a7 7 0 1 1 14 0c0 5.1-7 11-7 11z" />
      <Circle cx="12" cy="10.3" r="2.6" />
    </>
  ),
  star: <Path d="m12 3.6 2.7 5.5 6 .9-4.35 4.24 1.03 6L12 17.4l-5.38 2.84 1.03-6L3.3 10l6-.9z" />,
  clock: (
    <>
      <Circle cx="12" cy="12" r="8.5" />
      <Path d="M12 7v5.3l3.3 2" />
    </>
  ),
  sliders: (
    <>
      <Path d="M4 8h10M18 8h2M4 16h4M12 16h8" />
      <Circle cx="16" cy="8" r="2" />
      <Circle cx="10" cy="16" r="2" />
    </>
  ),
  calendar: (
    <>
      <Rect x="3.5" y="5.5" width="17" height="15" rx="2.5" />
      <Path d="M3.5 10h17M8 3.5v4M16 3.5v4" />
    </>
  ),
  'shield-check': (
    <>
      <Path d="M12 3.2 19 6v5.4c0 4.4-2.9 7.7-7 9.4-4.1-1.7-7-5-7-9.4V6z" />
      <Path d="m9 12 2.2 2.2L15.2 10" />
    </>
  ),
  'chevron-right': <Path d="m9.5 5 7 7-7 7" />,
  'chevron-left': <Path d="m14.5 5-7 7 7 7" />,
  'chevron-down': <Path d="m5 9.5 7 7 7-7" />,
  'arrow-left': <Path d="M20 12H4.5m0 0 6.5-6.5M4.5 12l6.5 6.5" />,
  'arrow-right': <Path d="M4 12h15.5m0 0L13 5.5M19.5 12 13 18.5" />,
  heart: (
    <Path d="M12 20.6s-7.6-4.7-9.4-9C1 8.1 3 4.6 6.4 4.6c2 0 3.4 1.1 4.2 2.3l1.4 1.9 1.4-1.9c.8-1.2 2.2-2.3 4.2-2.3 3.4 0 5.4 3.5 3.8 7-1.8 4.3-9.4 9-9.4 9z" />
  ),
  pencil: (
    <>
      <Path d="M16.6 3.9a2.2 2.2 0 0 1 3.1 3.1L8.4 18.3l-4.1 1 1-4.1z" />
      <Path d="m14.8 5.8 3.1 3.1" />
    </>
  ),
  'check-circle': (
    <>
      <Circle cx="12" cy="12" r="8.5" />
      <Path d="m8.4 12.2 2.5 2.5 4.7-5" />
    </>
  ),
  'question-circle': (
    <>
      <Circle cx="12" cy="12" r="8.5" />
      <Path d="M9.7 9.6a2.4 2.4 0 1 1 2.9 2.7v1.4" />
      <Circle cx="12.4" cy="16.6" r=".9" />
    </>
  ),
  info: (
    <>
      <Circle cx="12" cy="12" r="8.5" />
      <Path d="M12 11.2v5" />
      <Circle cx="12" cy="8.2" r=".9" />
    </>
  ),
  list: <Path d="M4 6.5h.01M4 12h.01M4 17.5h.01M9 6.5h11M9 12h11M9 17.5h11" />,
  map: (
    <>
      <Path d="M9 4.5 3.5 6.8v12.7L9 17.2l6 2.3 5.5-2.3V4.5L15 6.8z" />
      <Path d="M9 4.5v12.7M15 6.8v12.7" />
    </>
  ),
  more: (
    <>
      <Circle cx="12" cy="5" r="1.3" />
      <Circle cx="12" cy="12" r="1.3" />
      <Circle cx="12" cy="19" r="1.3" />
    </>
  ),
  send: <Path d="M4.5 12 20 4.5 12.5 20l-2-6.5z" />,
  camera: (
    <>
      <Path d="M3.5 8.5A2 2 0 0 1 5.5 6.5h2L9 4.5h6l1.5 2h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
      <Circle cx="12" cy="12.8" r="3.4" />
    </>
  ),
  plus: <Path d="M12 5v14M5 12h14" />,
  check: <Path d="m5 12.6 4.6 4.6L19 6.6" />,
  tag: (
    <>
      <Path d="M11.2 3.5H20v8.8l-8.4 8.4a1.6 1.6 0 0 1-2.3 0l-6.5-6.5a1.6 1.6 0 0 1 0-2.3z" />
      <Circle cx="16.2" cy="7.8" r="1.3" />
    </>
  ),
  battery: (
    <>
      <Rect x="3.5" y="8" width="15" height="8" rx="2" />
      <Path d="M21 11v2M7.5 11.5v3M11 11.5v3" />
    </>
  ),
  charger: (
    <>
      <Rect x="7" y="3.5" width="10" height="9" rx="2" />
      <Path d="M10 3.5v-1M14 3.5v-1M12 12.5v4a3.5 3.5 0 0 1-3.5 3.5H7" />
    </>
  ),
  case: (
    <>
      <Rect x="3" y="7.5" width="18" height="12" rx="2.5" />
      <Path d="M9 7.5v-2a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5.5v2M3 13h18" />
    </>
  ),
  ticks: <Path d="m2.5 12.5 3.5 3.5 6-7M10.5 15.5l1 1 6.5-7.5" />,
};

export function Icon({
  name,
  color,
  size = 22,
  filled = false,
  strokeWidth = 1.9,
}: {
  name: IconName;
  color: ColorValue;
  size?: number;
  filled?: boolean;
  strokeWidth?: number;
}) {
  const solid = filled && FILLABLE.has(name);
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={solid ? color : 'none'}
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {GLYPHS[name]}
    </Svg>
  );
}
