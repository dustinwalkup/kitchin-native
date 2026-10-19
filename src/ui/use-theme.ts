import { useColorScheme } from 'react-native';

import { type Theme, themes } from './theme';

/** The theme for the current appearance. The MVP is locked to light (R16.6), and dark equals light. */
export function useTheme(): Theme {
  return themes[useColorScheme() === 'dark' ? 'dark' : 'light'];
}
