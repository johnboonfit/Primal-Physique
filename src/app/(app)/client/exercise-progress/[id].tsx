import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ExerciseVolumeChart } from '@/components/exercise-volume-chart';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { getExerciseVolumeHistory, type ExerciseVolumeHistory, type VolumeTrend } from '@/lib/exercise-progress';

const TREND_ARROW: Record<VolumeTrend, string> = { up: '↑', maintaining: '→', down: '↓' };
const TREND_COLOR: Record<VolumeTrend, string> = { up: Colors.tealBright, maintaining: Colors.textSecondary, down: Accent };
const TREND_LABEL: Record<VolumeTrend, string> = {
  up: 'Trending up',
  maintaining: 'Holding steady',
  down: 'Trending down',
};

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function ExerciseProgressDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();

  const [history, setHistory] = useState<ExerciseVolumeHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session || !id) return;
    setLoading(true);
    getExerciseVolumeHistory(session.user.id, id)
      .then(setHistory)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load this exercise.'))
      .finally(() => setLoading(false));
  }, [session, id]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <ThemedText type="linkPrimary">Back</ThemedText>
          </Pressable>
          <ThemedText type="smallBold" numberOfLines={1} style={styles.headerTitle}>
            {history?.exerciseName ?? 'Exercise'}
          </ThemedText>
          <View style={{ width: 40 }} />
        </View>

        {loading && <ActivityIndicator style={styles.loader} />}
        {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}
        {!loading && !error && !history && (
          <ThemedText themeColor="textSecondary" style={styles.empty}>
            No sets logged for this exercise yet.
          </ThemedText>
        )}

        {!loading && !error && history && (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.trendRow}>
              <ThemedText type="title" style={{ color: TREND_COLOR[history.trend] }}>
                {TREND_ARROW[history.trend]}
              </ThemedText>
              <ThemedText type="smallBold" style={{ color: TREND_COLOR[history.trend] }}>
                {TREND_LABEL[history.trend]}
              </ThemedText>
            </View>

            {history.sessions.length >= 2 ? (
              <ExerciseVolumeChart sessions={history.sessions} />
            ) : (
              <ThemedText themeColor="textSecondary" style={styles.notEnoughData}>
                Log this exercise in at least one more session to see a progression graph.
              </ThemedText>
            )}

            <View style={styles.statGrid}>
              <ThemedView type="backgroundElement" style={styles.statTile}>
                <ThemedText type="small" themeColor="textSecondary">
                  Best weight
                </ThemedText>
                <ThemedText type="smallBold">{history.bestWeight !== null ? `${history.bestWeight}kg` : '—'}</ThemedText>
              </ThemedView>
              <ThemedView type="backgroundElement" style={styles.statTile}>
                <ThemedText type="small" themeColor="textSecondary">
                  Best session volume
                </ThemedText>
                <ThemedText type="smallBold">{history.bestVolume !== null ? `${history.bestVolume}kg` : '—'}</ThemedText>
              </ThemedView>
              <ThemedView type="backgroundElement" style={styles.statTile}>
                <ThemedText type="small" themeColor="textSecondary">
                  Sessions logged
                </ThemedText>
                <ThemedText type="smallBold">{history.sessions.length}</ThemedText>
              </ThemedView>
              <ThemedView type="backgroundElement" style={styles.statTile}>
                <ThemedText type="small" themeColor="textSecondary">
                  Last performed
                </ThemedText>
                <ThemedText type="smallBold">{formatDate(history.lastPerformed)}</ThemedText>
              </ThemedView>
            </View>

            <ThemedText type="smallBold" style={styles.historyLabel}>
              Session history
            </ThemedText>
            {[...history.sessions].reverse().map((s) => (
              <View key={s.assignmentId} style={styles.historyRow}>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatDate(s.date)}
                </ThemedText>
                <ThemedText type="small">
                  {s.volume}kg volume{s.topSetWeight !== null ? ` · top set ${s.topSetWeight}kg` : ''}
                </ThemedText>
              </View>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.two },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: Colors.backgroundSelected,
    marginBottom: Spacing.three,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    marginHorizontal: Spacing.two,
  },
  loader: {
    marginTop: Spacing.five,
  },
  error: {
    color: Accent,
    textAlign: 'center',
    marginTop: Spacing.five,
  },
  empty: {
    textAlign: 'center',
    marginTop: Spacing.five,
  },
  scrollContent: {
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    justifyContent: 'center',
  },
  notEnoughData: {
    textAlign: 'center',
    paddingVertical: Spacing.five,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  statTile: {
    flexBasis: '47%',
    flexGrow: 1,
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  historyLabel: {
    marginTop: Spacing.two,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: Colors.backgroundElement,
  },
});
