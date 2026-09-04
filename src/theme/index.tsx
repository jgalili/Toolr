import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { colors, hitSize, radius, shadow, spacing, type, type Colors } from './tokens';

export * from './tokens';

type Theme = {
  colors: Colors;
  spacing: typeof spacing;
  radius: typeof radius;
  type: typeof type;
  shadow: typeof shadow;
  hitSize: typeof hitSize;
  isDark: boolean;
};

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const value = useMemo<Theme>(
    () => ({
      colors: isDark ? colors.dark : colors.light,
      spacing,
      radius,
      type,
      shadow,
      hitSize,
      isDark,
    }),
    [isDark],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
