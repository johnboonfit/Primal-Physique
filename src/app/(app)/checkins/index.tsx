import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HeroStat } from '@/components/hero-stat';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { getErrorMessage } from '@/lib/errors';
import { listCompletedCheckIns, markCheckinsViewed, type CoachCheckInSubmission } from '@/lib/form-check-ins';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * The coach's own review queue — every completed check-in across every
 * client, most recent first. Didn't exist as a dedicated screen before
 * this chunk (only checkins/[id].tsx, a shared detail view reached from
 * a client's own page); this is what the Home dashboard's "Check-ins"
 * nav card badge now points to, and marking it viewed here is what
 * clears that badge.
 */
export default function CoachCheckInsScreen() {
  const { session } = useAuth();
  const [submissions, setSubmissions] = useState<CoachCheckInSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      let cancelled = false;

      setLoading(true);
      listCompletedCheckIns()
        .then((data) => {
          if (!cancelled) setSubmissions(data);
        })
        .catch((err) => {
          if (!cancelled) setError(getErrorMessage(err, 'Failed to load check-in submissions.'));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

      markCheckinsViewed(session.user.id).catch((err) => console.error('Failed to mark check-ins viewed:', err));

      return () => {
        cancelled = true;
      };
    }, [session])
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.header}>
          <ThemedText type="title">Check-ins</ThemedText>
        </ThemedView>

        {!loading && !error && <HeroStat value={submissions.length} label="Completed Submissions" />}

        {loading && <ActivityIndicator style={styles.loader} />}
        {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}

        {!loading && !error && submissions.length === 0 && (
          <ThemedText themeColor="textSecondary" style={styles.empty}>
            No check-ins completed yet.
          </ThemedText>
        )}

        {!loading && !error && submissions.length > 0 && (
          <FlatList
            data={submissions}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <Pressable onPress={() => router.push(`/checkins/${item.id}`)}>
                <ThemedView type="backgroundElement" style={styles.card}>
                  <ThemedText type="smallBold">{item.clientName}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {item.formName} · {formatDate(item.completedAt)}
                  </ThemedText>
                </ThemedView>
              </Pressable>
            )}
          />
        )}

        <Pressable style={styles.backButton} onPress={() => router.replace('/home')}>
          <ThemedText type="linkPrimary">Back to home</ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.four },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.three,
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
  listContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.four,
  },
  card: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  backButton: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
});
