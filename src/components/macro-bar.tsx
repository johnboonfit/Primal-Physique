import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Accent, Colors, Spacing } from '@/constants/theme';

type MacroBarProps = {
  label: string;
  /** Grams logged so far today. */
  current: number;
  /** Grams targeted for today. */
  target: number;
};

/**
 * One macro's row in the Nutrition screen's top card -- label, current
 * vs. target in grams, a thin fill bar, and a "Xg LEFT"/"+Xg OVER"
 * caption. Deliberately just one accent color across all three macros
 * (teal on track, same as everywhere else in the app) rather than a
 * different hue per macro -- the label and numbers already tell protein
 * apart from carbs and fat. The one exception is going over target:
 * that reuses Accent (oxblood), the same color every other warning/
 * error text in the app already uses, not a new decorative color.
 */
export function MacroBar({ label, current, target }: MacroBarProps) {
  const over = current > target;
  const fraction = target > 0 ? Math.min(1, current / target) : 0;
  const remaining = Math.abs(target - current);

  return (
    <View style={styles.row}>
      <View style={styles.headerRow}>
        <View style={styles.labelRow}>
          <View style={[styles.dot, over && styles.dotOver]} />
          <ThemedText type="small">{label}</ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {Math.round(current)}/{Math.round(target)}g
        </ThemedText>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, over && styles.fillOver, { width: `${fraction * 100}%` }]} />
      </View>
      <ThemedText type="small" style={over ? styles.captionOver : styles.captionUnder}>
        {over ? `+${Math.round(remaining)}g OVER` : `${Math.round(remaining)}g LEFT`}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: Spacing.half,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.tealBright,
  },
  dotOver: {
    backgroundColor: Accent,
  },
  track: {
    width: '100%',
    height: 6,
    borderRadius: 999,
    backgroundColor: Colors.backgroundSelected,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: Colors.tealBright,
  },
  fillOver: {
    backgroundColor: Accent,
  },
  captionUnder: {
    color: Colors.textSecondary,
  },
  captionOver: {
    color: Accent,
  },
});
