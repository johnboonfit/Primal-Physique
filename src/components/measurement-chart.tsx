import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import { Colors, Spacing } from '@/constants/theme';

type MeasurementPoint = {
  logDate: string;
  value: number;
};

const WIDTH = 320;
const HEIGHT = 180;
const PADDING = 20;

/**
 * A single raw-value line over time — no smoothing, no second series.
 * Deliberately the same time-proportional-X, padded-Y-range approach as
 * WeightTrendChart, just with one line instead of two, since there's no
 * trend calculation for a body measurement to plot alongside the actual
 * number.
 */
export function MeasurementChart({ entries }: { entries: MeasurementPoint[] }) {
  const sorted = useMemo(() => [...entries].sort((a, b) => (a.logDate < b.logDate ? -1 : 1)), [entries]);

  const timestamps = useMemo(
    () => sorted.map((entry) => new Date(`${entry.logDate}T00:00:00.000Z`).getTime()),
    [sorted]
  );

  if (sorted.length < 2) return null;

  const minTime = timestamps[0];
  const maxTime = timestamps[timestamps.length - 1];
  const timeRange = maxTime - minTime || 1;

  const values = sorted.map((entry) => entry.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valuePadding = (maxValue - minValue || 1) * 0.15;
  const paddedMin = minValue - valuePadding;
  const paddedRange = maxValue + valuePadding - paddedMin || 1;

  const xFor = (time: number) => PADDING + ((time - minTime) / timeRange) * (WIDTH - PADDING * 2);
  const yFor = (value: number) => HEIGHT - PADDING - ((value - paddedMin) / paddedRange) * (HEIGHT - PADDING * 2);

  const points = sorted.map((entry, i) => `${xFor(timestamps[i])},${yFor(entry.value)}`).join(' ');

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
        <Polyline points={points} fill="none" stroke={Colors.tealBright} strokeWidth={2} />
        {sorted.map((entry, i) => (
          <Circle key={entry.logDate} cx={xFor(timestamps[i])} cy={yFor(entry.value)} r={3} fill={Colors.tealBright} />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.two,
  },
});
