import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Glow, Spacing } from '@/constants/theme';

type HeroStatProps = {
  value: number | string;
  label: string;
  /** 0–1. When given, renders a thin progress bar under the label —
   * used for the Momentum Score's 1–10 scale. */
  progress?: number;
};

/**
 * The oversized-number dashboard block used on every list-style screen —
 * a deep-teal card with a soft teal glow behind it, so the one number
 * that matters on a screen reads as dominant rather than competing
 * equally with the list below it.
 */
export function HeroStat({ value, label, progress }: HeroStatProps) {
  return (
    <View style={styles.glowWrap}>
      <ThemedView type="tealDeep" style={styles.card}>
        <ThemedText type="hero">{value}</ThemedText>
        <ThemedText type="smallBold" style={styles.label}>
          {label}
        </ThemedText>
        {progress !== undefined && (
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.min(1, Math.max(0, progress)) * 100}%` }]} />
          </View>
        )}
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
  track: {
    width: '100%',
    height: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.3)',
    overflow: 'hidden',
    marginTop: Spacing.two,
  },
  fill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: Colors.tealBright,
  },
});
