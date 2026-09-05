import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing } from '@/constants/theme';
import { listCoachFormCheckSubmissions, type CoachFormCheckSubmission } from '@/lib/form-check';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Coach-only: every submission across every client, pending ones
 * first (oldest first, so it reads as a queue to work through), then
 * already-reviewed ones. */
export default function CoachFormCheckScreen() {
  const [submissions, setSubmissions] = useState<CoachFormCheckSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      setError(null);
      listCoachFormCheckSubmissions()
        .then(setSubmissions)
        .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load Form Check submissions.'))
        .finally(() => setLoading(false));
    }, [])
  );

  const pendingCount = submissions.filter((s) => s.status === 'pending').length;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Pressable style={styles.backLink} hitSlop={8} onPress={() => router.replace('/home')}>
          <ThemedText type="linkPrimary">‹ Back</ThemedText>
        </Pressable>

        <View style={styles.header}>
          <ThemedText type="title">Form Check</ThemedText>
          {pendingCount > 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              {pendingCount} awaiting review
            </ThemedText>
          )}
        </View>

        {loading && <ActivityIndicator style={styles.loader} />}
        {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}
        {!loading && !error && submissions.length === 0 && (
          <ThemedText themeColor="textSecondary" style={styles.empty}>
            Nothing submitted yet.
          </ThemedText>
        )}

        {!loading && !error && (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {submissions.map((submission) => (
              <Pressable key={submission.id} onPress={() => router.push(`/form-check/${submission.id}`)}>
                <ThemedView type="backgroundElement" style={styles.card}>
                  <View style={styles.cardHeaderRow}>
                    <ThemedText type="smallBold" style={styles.exerciseName}>
                      {submission.exerciseName}
                    </ThemedText>
                    <ThemedText
                      type="small"
                      style={submission.status === 'reviewed' ? styles.reviewedBadge : styles.pendingBadge}>
                      {submission.status === 'reviewed' ? 'Reviewed' : 'Pending'}
                    </ThemedText>
                  </View>
                  <ThemedText type="small" themeColor="textSecondary">
                    {submission.clientName} · {formatDate(submission.createdAt)}
                  </ThemedText>
                </ThemedView>
              </Pressable>
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
  backLink: {
    marginBottom: Spacing.two,
    alignSelf: 'flex-start',
  },
  header: {
    marginBottom: Spacing.three,
    gap: Spacing.half,
  },
  loader: {
    marginTop: Spacing.five,
  },
  error: {
    color: Colors.oxblood,
    textAlign: 'center',
  },
  empty: {
    textAlign: 'center',
    marginTop: Spacing.five,
  },
  scrollContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.four,
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
  exerciseName: {
    flex: 1,
  },
  pendingBadge: {
    color: Colors.textSecondary,
  },
  reviewedBadge: {
    color: Colors.tealBright,
  },
});
