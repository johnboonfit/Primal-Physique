import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { getProgrammeWeekContext, type ProgrammeWeekContext } from '@/lib/programmes';
import { listWorkoutsForWeek, type WorkoutSummary } from '@/lib/workouts';

export default function ProgrammeWeekScreen() {
  const { weekId } = useLocalSearchParams<{ weekId: string }>();

  const [context, setContext] = useState<ProgrammeWeekContext | null>(null);
  const [workouts, setWorkouts] = useState<WorkoutSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!weekId) return;
      let cancelled = false;

      setLoading(true);
      Promise.all([getProgrammeWeekContext(weekId), listWorkoutsForWeek(weekId)])
        .then(([contextData, workoutData]) => {
          if (cancelled) return;
          setContext(contextData);
          setWorkouts(workoutData);
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load this week.');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }, [weekId])
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Pressable
          onPress={() => (context ? router.replace(`/programmes/${context.programmeId}`) : router.back())}
          style={styles.backButton}>
          <ThemedText type="linkPrimary">Back to programme</ThemedText>
        </Pressable>

        {loading && <ActivityIndicator style={styles.loader} />}

        {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}

        {!loading && context && (
          <ThemedView style={styles.header}>
            <ThemedText type="title" style={styles.title}>
              Week {context.weekNumber}
            </ThemedText>
            <ThemedText themeColor="textSecondary">{context.programmeName}</ThemedText>
          </ThemedView>
        )}

        {!loading && !error && (
          <Pressable
            style={styles.newButton}
            onPress={() => router.push({ pathname: '/workouts/new', params: { weekId } })}>
            <ThemedText type="smallBold" style={styles.newButtonText}>
              + New session
            </ThemedText>
          </Pressable>
        )}

        {!loading && !error && workouts.length === 0 && (
          <ThemedText themeColor="textSecondary" style={styles.empty}>
            No sessions in this week yet. Tap + New session to add one.
          </ThemedText>
        )}

        {!loading && !error && workouts.length > 0 && (
          <FlatList
            data={workouts}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText type="smallBold">{item.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {item.exerciseCount} exercise{item.exerciseCount === 1 ? '' : 's'}
                </ThemedText>
              </ThemedView>
            )}
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.four },
  backButton: {
    marginBottom: Spacing.two,
  },
  loader: {
    marginTop: Spacing.five,
  },
  error: {
    color: Accent,
    textAlign: 'center',
    marginTop: Spacing.five,
  },
  header: {
    marginBottom: Spacing.three,
    gap: Spacing.half,
  },
  title: {
    fontSize: 32,
    lineHeight: 38,
  },
  newButton: {
    ...Glow.oxblood,
    backgroundColor: Accent,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    alignSelf: 'flex-start',
    marginBottom: Spacing.three,
  },
  newButtonText: {
    color: Colors.text,
  },
  empty: {
    textAlign: 'center',
    marginTop: Spacing.five,
  },
  listContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.four,
  },
  card: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.half,
  },
});
