import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';
import type { ExerciseSessionPoint } from '@/lib/exercise-progress';

const WIDTH = 320;
const HEIGHT = 180;
const PADDING = 20;

/**
 * One line: total volume (weight x reps, summed across every set) per
 * session, oldest to newest — the same "spaced by actual elapsed time,
 * not just by index" shape WeightTrendChart already uses, so a 6-week
 * gap between two sessions reads as a real gap, not a mistake.
 */
export function ExerciseVolumeChart({ sessions }: { sessions: ExerciseSessionPoint[] }) {
  const timestamps = useMemo(() => sessions.map((s) => new Date(`${s.date}T00:00:00.000Z`).getTime()), [sessions]);

  if (sessions.length < 2) return null;

  const minTime = timestamps[0];
  const maxTime = timestamps[timestamps.length - 1];
  const timeRange = maxTime - minTime || 1;

  const volumes = sessions.map((s) => s.volume);
  const minValue = Math.min(0, ...volumes);
  const maxValue = Math.max(...volumes);
  const valuePadding = (maxValue - minValue || 1) * 0.15;
  const paddedMin = minValue;
  const paddedRange = maxValue + valuePadding - paddedMin || 1;

  const xFor = (time: number) => PADDING + ((time - minTime) / timeRange) * (WIDTH - PADDING * 2);
  const yFor = (value: number) => HEIGHT - PADDING - ((value - paddedMin) / paddedRange) * (HEIGHT - PADDING * 2);

  const points = sessions.map((s, i) => `${xFor(timestamps[i])},${yFor(s.volume)}`).join(' ');

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
        {sessions.map((s, i) => (
          <Circle key={s.assignmentId} cx={xFor(timestamps[i])} cy={yFor(s.volume)} r={3} fill={Colors.tealBright} />
        ))}
      </Svg>
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.tealBright }]} />
          <ThemedText type="small" themeColor="textSecondary">
            Volume per session
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
