import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';

const SIZE = 84;
const STROKE = 7;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

type MacroRingProps = {
  /** Grams, shown as the number inside the ring. */
  value: number;
  label: string;
  /** 0–1. This app has no macro *targets* to track progress against —
   * so rather than fake a goal, the ring fills to show this macro's
   * share of today's total calories (its grams × its kcal/g, divided
   * by total calories). A half-full protein ring means "protein made
   * up about half of today's calories," not "you're 50% to a goal." */
  progress: number;
};

/**
 * A single macro's ring — deliberately just one accent color
 * (tealBright), the same "dark track, teal fill" pairing HeroStat's own
 * linear progress bar already uses, so this reads as the same visual
 * language rather than a new one. Macros are told apart by their label
 * and number, not by color-coding each ring differently.
 */
export function MacroRing({ value, label, progress }: MacroRingProps) {
  const clamped = Math.min(1, Math.max(0, progress));
  const dashOffset = CIRCUMFERENCE * (1 - clamped);

  return (
    <View style={styles.wrap}>
      <View style={styles.ringBox}>
        <Svg width={SIZE} height={SIZE}>
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={Colors.backgroundSelected}
            strokeWidth={STROKE}
            fill="none"
          />
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={Colors.tealBright}
            strokeWidth={STROKE}
            fill="none"
            strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            // `rotation`/`origin` are deprecated in this version of
            // react-native-svg (origin specifically expects a numeric
            // [x, y] tuple, not the "x, y" string form) — the standard
            // SVG `transform` string is the documented replacement for
            // both, and starts the arc from the top instead of the
            // default 3 o'clock position.
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        </Svg>
        <View style={styles.centerLabel} pointerEvents="none">
          <ThemedText type="smallBold">{value}g</ThemedText>
        </View>
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  ringBox: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerLabel: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
