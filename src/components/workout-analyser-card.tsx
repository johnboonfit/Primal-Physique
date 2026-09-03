import { StyleSheet, View } from 'react-native';

import { colorForCount, MuscleHeatmap, TIER_COLORS } from '@/components/muscle-heatmap';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { MUSCLE_GROUPS } from '@/lib/exercise-library';
import { overallVolumeStatus, type MuscleGroupCounts, type VolumeTier } from '@/lib/muscle-group-analysis';

const STATUS_LABEL: Record<VolumeTier, string> = {
  low: 'LOW VOLUME',
  moderate: 'MODERATE VOLUME',
  high: 'HIGH VOLUME',
};

function StatusBadge({ status }: { status: VolumeTier }) {
  const color = TIER_COLORS[status];
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <View style={[styles.badgeDot, { backgroundColor: color }]} />
      <ThemedText type="smallBold" style={[styles.badgeText, { color }]}>
        {STATUS_LABEL[status]}
      </ThemedText>
    </View>
  );
}

type WorkoutAnalyserCardProps = {
  counts: MuscleGroupCounts;
};

/**
 * This week's per-muscle-group set count, at a glance -- the heat-map is
 * the headline view, the list below it is the same data in exact numbers
 * for anyone who wants the precise count rather than a color.
 */
export function WorkoutAnalyserCard({ counts }: WorkoutAnalyserCardProps) {
  const status = overallVolumeStatus(counts);

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.headerRow}>
        <ThemedText type="smallBold">Volume Analyser</ThemedText>
        <StatusBadge status={status} />
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        Sets logged this week, by muscle group
      </ThemedText>

      <MuscleHeatmap counts={counts} />

      <View style={styles.list}>
        {MUSCLE_GROUPS.map((group) => {
          const count = counts[group.key];
          const color = colorForCount(count);
          return (
            <View key={group.key} style={styles.listRow}>
              <View style={styles.listLabelGroup}>
                <View style={[styles.listDot, { backgroundColor: color }]} />
                <ThemedText type="small">{group.label}</ThemedText>
              </View>
              <ThemedText type="smallBold">{count} {count === 1 ? 'set' : 'sets'}</ThemedText>
            </View>
          );
        })}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeText: {
    letterSpacing: 0.5,
  },
  list: {
    width: '100%',
    gap: Spacing.two,
  },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  listLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  listDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
