import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing } from '@/constants/theme';

type StatTileProps = {
  value: string;
  label: string;
  subtitle?: string;
  color?: string;
  /** A stat with no real data behind it yet (e.g. Steps, before a
   * wearable is connected) — a dashed border and muted value instead of
   * the normal teal top-bar and bold white number, so it visibly reads
   * as "not connected" rather than a real zero. */
  muted?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * The compact stat card used for side-by-side "hero box" rows (2-across
 * on the coach dashboard, 3-across on the client Home tab) — a smaller
 * sibling of <HeroStat>, which is built for one full-width dominant
 * number instead of several sharing a row.
 */
export function StatTile({ value, label, subtitle, color, muted, onPress, style }: StatTileProps) {
  return (
    <Pressable style={({ pressed }) => [style, pressed && onPress && styles.pressed]} onPress={onPress} disabled={!onPress}>
      <ThemedView type="backgroundElement" style={[styles.card, muted && styles.cardMuted]}>
        <ThemedText type="title" style={[styles.value, color ? { color } : undefined, muted && styles.mutedValue]} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
          {label}
        </ThemedText>
        {subtitle && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
            {subtitle}
          </ThemedText>
        )}
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.half,
    borderTopWidth: 3,
    borderTopColor: Colors.tealBright,
  },
  cardMuted: {
    borderTopWidth: 1,
    borderTopColor: Colors.backgroundSelected,
    borderWidth: 1,
    borderColor: Colors.backgroundSelected,
    borderStyle: 'dashed',
  },
  value: {
    fontSize: 28,
    lineHeight: 32,
  },
  mutedValue: {
    color: Colors.textSecondary,
  },
  label: {
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    fontSize: 11,
    lineHeight: 14,
  },
  subtitle: {
    fontSize: 11,
    lineHeight: 14,
  },
  pressed: {
    opacity: 0.85,
  },
});
