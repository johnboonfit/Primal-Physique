/**
 * Primal Physique's single brand theme — elite, dark, results-driven.
 * This app no longer adapts to the device's light/dark setting; it always
 * renders this one look. Every color used anywhere in the app should come
 * from this file — nothing hardcoded per-screen.
 *
 * Color roles (don't mix these up):
 *   - oxblood   → buttons and active/selected states ONLY. Never decoration.
 *   - tealDeep  → surfaces for data/stat elements (hero-number cards).
 *   - tealBright → small accents only (status labels, thin highlight bars).
 *                  Never a large fill, never on CTA buttons, never body text.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  background: '#0A0A0A', // carbon black
  backgroundElement: '#151515', // quiet card surface for ordinary list rows
  backgroundSelected: '#262626', // input borders, unselected control backgrounds
  text: '#F5F3EF', // bone white
  textSecondary: '#8C8A85', // dimmed bone white for secondary/meta text
  oxblood: '#6B0F1A', // primary accent — buttons + active/selected states only
  tealDeep: '#0F3D3E', // secondary accent — stat/data card surfaces
  tealDeepLight: '#1A4D4E', // upper end of the deep-teal range
  tealBright: '#2E8B8B', // highlight accent — small accents only, never a fill
} as const;

export type ThemeColor = keyof typeof Colors;

/** Primary accent — buttons and active/selected states only. */
export const Accent = Colors.oxblood;

/**
 * Soft ambient glow, applied via a container's style prop. Deliberately
 * subtle: readable text always wins over the glow.
 */
export const Glow = {
  teal: {
    shadowColor: Colors.tealBright,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 8,
  },
  oxblood: {
    shadowColor: Colors.oxblood,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 8,
  },
} as const;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
