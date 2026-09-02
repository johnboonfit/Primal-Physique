import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Accent, Colors, Spacing } from '@/constants/theme';

type WeightPoint = {
  logDate: string;
  weight: number;
  weightTrend: number;
};

const WIDTH = 320;
const HEIGHT = 180;
const PADDING = 20;

/**
 * Actual weight (teal) and the smoothed trend (red/oxblood) on one
 * chart, so the noisy day-to-day number and the real underlying
 * direction are visible together. Points are spaced by actual elapsed
 * time, not just by index — a 5-day gap between weigh-ins takes up 5x
 * the horizontal space of a 1-day gap, rather than pretending logging
 * was daily.
 */
export function WeightTrendChart({ entries }: { entries: WeightPoint[] }) {
  const sorted = useMemo(() => [...entries].sort((a, b) => (a.logDate < b.logDate ? -1 : 1)), [entries]);

  const timestamps = useMemo(
    () => sorted.map((entry) => new Date(`${entry.logDate}T00:00:00.000Z`).getTime()),
    [sorted]
  );

  if (sorted.length < 2) return null;

  const minTime = timestamps[0];
  const maxTime = timestamps[timestamps.length - 1];
  const timeRange = maxTime - minTime || 1;

  const values = sorted.flatMap((entry) => [entry.weight, entry.weightTrend]);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valuePadding = (maxValue - minValue || 1) * 0.15;
  const paddedMin = minValue - valuePadding;
  const paddedRange = maxValue + valuePadding - paddedMin || 1;

  const xFor = (time: number) => PADDING + ((time - minTime) / timeRange) * (WIDTH - PADDING * 2);
  const yFor = (value: number) => HEIGHT - PADDING - ((value - paddedMin) / paddedRange) * (HEIGHT - PADDING * 2);

  const weightPoints = sorted.map((entry, i) => `${xFor(timestamps[i])},${yFor(entry.weight)}`).join(' ');
  const trendPoints = sorted.map((entry, i) => `${xFor(timestamps[i])},${yFor(entry.weightTrend)}`).join(' ');

  return (
    <View style={styles.wrap}>
      <Svg width="100%" height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
        <Line
          x1={PADDING}
          y1={HEIGHT - PADDING}
          x2={WIDTH - PADDING}
          y2={HEIGHT - PADDING}
          stroke={Colors.backgroundSelected}
          strokeWidth={1}
        />
        <Polyline points={weightPoints} fill="none" stroke={Colors.tealBright} strokeWidth={2} />
        <Polyline points={trendPoints} fill="none" stroke={Accent} strokeWidth={2.5} />
        {sorted.map((entry, i) => (
          <Circle key={entry.logDate} cx={xFor(timestamps[i])} cy={yFor(entry.weight)} r={3} fill={Colors.tealBright} />
        ))}
      </Svg>
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.tealBright }]} />
          <ThemedText type="small" themeColor="textSecondary">
            Actual weight
          </ThemedText>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Accent }]} />
          <ThemedText type="small" themeColor="textSecondary">
            Trend
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.two,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.four,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
