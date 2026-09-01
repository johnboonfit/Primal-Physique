import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';

/**
 * Fixed brand mark shown in the top-left of every screen. Rendered
 * exactly as the source file looks — no tinting, no recoloring to match
 * the teal/oxblood accent system used everywhere else in the app.
 */
export function BrandLogo() {
  const insets = useSafeAreaInsets();

  return (
    <Image
      source={require('@/assets/images/logo.jpg')}
      style={[styles.logo, { top: insets.top + Spacing.one, left: Spacing.two }]}
      contentFit="contain"
    />
  );
}

const styles = StyleSheet.create({
  logo: {
    position: 'absolute',
    width: 26,
    height: 26,
    zIndex: 999,
  },
});
