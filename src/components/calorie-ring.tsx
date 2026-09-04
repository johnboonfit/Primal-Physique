import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';

const SIZE = 128;
const STROKE_WIDTH = 10;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

type CalorieRingProps = {
  current: number;
  /** Null when there's no calorie target yet (not enough logged
   * history) -- renders just the current total, dashed and un-filled,
   * the same "not tracked yet" honesty stat-ring.tsx's muted mode
   * already uses, rather than a fabricated goal. */
  target: number | null;
};

/**
 * The Nutrition screen's hero number -- today's logged calories, as a
 * ring instead of a linear bar (see HeroStat for that older pattern,
 * still used elsewhere). One teal accent, same as every other ring in
 * the app; the ring simply doesn't fill past what's real when there's
 * no target to measure against yet.
 */
export function CalorieRing({ current, target }: CalorieRingProps) {
  const hasTarget = target !== null && target > 0;
  const fraction = hasTarget ? Math.min(1, current / target) : 0;
  const dashOffset = CIRCUMFERENCE * (1 - fraction);

  return (
    <View style={styles.wrap}>
      <Svg width={SIZE} height={SIZE} style={styles.svg}>
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={Colors.backgroundSelected}
          strokeWidth={hasTarget ? STROKE_WIDTH : 1.5}
          strokeDasharray={hasTarget ? undefined : '4, 7'}
          fill="none"
        />
        {hasTarget && (
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={Colors.tealBright}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            fill="none"
            transform={`rotate(-90, ${SIZE / 2}, ${SIZE / 2})`}
          />
        )}
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <ThemedText style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
          {Math.round(current).toLocaleString()}
        </ThemedText>
        {hasTarget && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.target} numberOfLines={1}>
            / {Math.round(target).toLocaleString()}
          </ThemedText>
        )}
        <ThemedText type="small" themeColor="textSecondary" style={styles.unit}>
          KCAL
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  svg: {
    position: 'absolute',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.one,
  },
  value: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '800',
    textAlign: 'center',
  },
  target: {
    textAlign: 'center',
  },
  unit: {
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: Spacing.half,
  },
});
