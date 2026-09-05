import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { listExercisesWithHistory, type ExerciseHistorySummary, type VolumeTrend } from '@/lib/exercise-progress';

const TREND_ARROW: Record<VolumeTrend, string> = { up: '↑', maintaining: '→', down: '↓' };
const TREND_COLOR: Record<VolumeTrend, string> = { up: Colors.tealBright, maintaining: Colors.textSecondary, down: Accent };
const TREND_LABEL: Record<VolumeTrend, string> = { up: 'Volume trending up', maintaining: 'Volume steady', down: 'Volume trending down' };

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Every exercise this client has ever logged a set for, alphabetically
 * — each card links through to a full progression graph for just that
 * exercise (exercise-progress/[id].tsx). */
export function ExerciseProgressPanel() {
  const { session } = useAuth();

  const [exercises, setExercises] = useState<ExerciseHistorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      setLoading(true);
      listExercisesWithHistory(session.user.id)
        .then(setExercises)
        .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load your exercise history.'))
        .finally(() => setLoading(false));
    }, [session])
  );

  if (loading) return <ActivityIndicator style={styles.loader} />;
  if (error) return <ThemedText style={styles.error}>{error}</ThemedText>;
  if (exercises.length === 0) {
    return (
      <ThemedText themeColor="textSecondary" style={styles.empty}>
        Log a few workouts and every exercise you've done will show up here with its own progress graph.
      </ThemedText>
    );
  }

  return (
    <View style={styles.list}>
      {exercises.map((exercise) => (
        <Pressable
          key={exercise.exerciseLibraryId}
          onPress={() => router.push(`/client/exercise-progress/${exercise.exerciseLibraryId}` as never)}>
          <ThemedView type="backgroundElement" style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <ThemedText type="smallBold" style={styles.cardName}>
                {exercise.exerciseName}
              </ThemedText>
              <View style={styles.trendRow} accessibilityLabel={TREND_LABEL[exercise.trend]}>
                <ThemedText type="smallBold" style={{ color: TREND_COLOR[exercise.trend] }}>
                  {TREND_ARROW[exercise.trend]}
                </ThemedText>
              </View>
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {exercise.sessionCount} session{exercise.sessionCount === 1 ? '' : 's'} · Last: {formatDate(exercise.lastPerformed)}
              {exercise.bestWeight !== null ? ` · Best: ${exercise.bestWeight}kg` : ''}
            </ThemedText>
          </ThemedView>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
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
  list: {
    gap: Spacing.two,
  },
  card: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  cardName: {
    flex: 1,
  },
  trendRow: {
    minWidth: 24,
    alignItems: 'flex-end',
  },
});
