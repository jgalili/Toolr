import React from 'react';
import type { ColorValue } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

export type TabIconName = 'home' | 'search' | 'plus' | 'inbox' | 'person';

const PATHS: Record<TabIconName, React.ReactNode> = {
  home: <Path d="M3 11.5L12 4l9 7.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z" />,
  search: (
    <>
      <Circle cx="11" cy="11" r="6.5" fill="none" />
      <Path d="M16 16l4.5 4.5" />
    </>
  ),
  plus: <Path d="M12 5v14M5 12h14" />,
  inbox: (
    <>
      <Path d="M3 6.5A2.5 2.5 0 015.5 4h13A2.5 2.5 0 0121 6.5v11a2.5 2.5 0 01-2.5 2.5h-13A2.5 2.5 0 013 17.5z" fill="none" />
      <Path d="M3 9h5l1.5 2.5h5L16 9h5" fill="none" />
    </>
  ),
  person: (
    <>
      <Circle cx="12" cy="8" r="4" fill="none" />
      <Path d="M4.5 20a7.5 7.5 0 0115 0" fill="none" />
    </>
  ),
};

export function TabIcon({
  name,
  color,
  size = 24,
  filled,
}: {
  name: TabIconName;
  color: ColorValue;
  size?: number;
  filled?: boolean;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled && name === 'home' ? color : 'none'}
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name]}
    </Svg>
  );
}
