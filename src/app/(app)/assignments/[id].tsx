import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Spacing } from '@/constants/theme';
import { getCoachAssignmentDetail, type CoachAssignmentDetail } from '@/lib/assignments';

export default function CoachAssignmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [detail, setDetail] = useState<CoachAssignmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    getCoachAssignmentDetail(id)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load this assignment.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <ThemedText type="linkPrimary">Back</ThemedText>
          </Pressable>

          {loading && <ActivityIndicator style={styles.loader} />}

          {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}

          {!loading && detail && (
            <>
              <ThemedText type="title" style={styles.title}>
                {detail.workoutName}
              </ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.subtitle}>
                {detail.clientEmail} · {detail.assignedDate} ·{' '}
                <ThemedText
                  type="smallBold"
                  themeColor={detail.status === 'completed' ? undefined : 'textSecondary'}
                  style={detail.status === 'completed' ? styles.statusCompleted : undefined}>
                  {detail.status === 'completed' ? 'Completed' : 'Pending'}
                </ThemedText>
              </ThemedText>

              {detail.status === 'pending' && (
                <ThemedText themeColor="textSecondary" style={styles.pendingNote}>
                  The client hasn&apos;t logged this workout yet.
                </ThemedText>
              )}

              {detail.exercises.map((exercise) => (
                <ThemedView key={exercise.id} type="backgroundElement" style={styles.exerciseCard}>
                  <ThemedText type="smallBold">{exercise.name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Prescribed: {exercise.setsReps}
                  </ThemedText>
                  <ThemedText type="small">
                    Actual: {exercise.loggedWeight ?? '—'} weight · {exercise.loggedReps ?? '—'} reps
                  </ThemedText>
                </ThemedView>
              ))}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.two,
  },
  backButton: {
    marginBottom: Spacing.two,
  },
  title: {
    marginTop: Spacing.two,
  },
  subtitle: {
    marginBottom: Spacing.two,
  },
  statusCompleted: {
    color: Colors.tealBright,
  },
  pendingNote: {
    marginBottom: Spacing.two,
  },
  loader: {
    marginTop: Spacing.five,
  },
  error: {
    color: Accent,
    textAlign: 'center',
  },
  exerciseCard: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.half,
  },
});
