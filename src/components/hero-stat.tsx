import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Glow, Spacing } from '@/constants/theme';

/**
 * The oversized-number dashboard block used on every list-style screen —
 * a deep-teal card with a soft teal glow behind it, so the one number
 * that matters on a screen reads as dominant rather than competing
 * equally with the list below it.
 */
export function HeroStat({ value, label }: { value: number | string; label: string }) {
  return (
    <View style={styles.glowWrap}>
      <ThemedView type="tealDeep" style={styles.card}>
        <ThemedText type="hero">{value}</ThemedText>
        <ThemedText type="smallBold" style={styles.label}>
          {label}
        </ThemedText>
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  glowWrap: {
    ...Glow.teal,
    borderRadius: Spacing.four,
    marginBottom: Spacing.three,
  },
  card: {
    borderRadius: Spacing.four,
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    gap: Spacing.one,
    borderTopWidth: 3,
    borderTopColor: Colors.tealBright,
  },
  label: {
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
