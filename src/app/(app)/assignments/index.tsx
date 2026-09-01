import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HeroStat } from '@/components/hero-stat';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { listAssignments, type AssignmentSummary } from '@/lib/assignments';

export default function AssignmentsListScreen() {
  const { session } = useAuth();
  const [assignments, setAssignments] = useState<AssignmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      let cancelled = false;

      setLoading(true);
      listAssignments(session.user.id)
        .then((data) => {
          if (!cancelled) setAssignments(data);
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load assignments.');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }, [session])
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.header}>
          <ThemedText type="title">Assignments</ThemedText>
          <Pressable style={styles.newButton} onPress={() => router.push('/assignments/new')}>
            <ThemedText type="smallBold" style={styles.newButtonText}>
              + New
            </ThemedText>
          </Pressable>
        </ThemedView>

        {!loading && !error && <HeroStat value={assignments.length} label="Assignments Made" />}

        {loading && <ActivityIndicator style={styles.loader} />}

        {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}

        {!loading && !error && assignments.length === 0 && (
          <ThemedText themeColor="textSecondary" style={styles.empty}>
            No assignments yet. Tap + New to assign a workout to a client.
          </ThemedText>
        )}

        {!loading && !error && assignments.length > 0 && (
          <FlatList
            data={assignments}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <Pressable onPress={() => router.push(`/assignments/${item.id}`)}>
                <ThemedView type="backgroundElement" style={styles.card}>
                  <ThemedText type="smallBold">{item.workoutName}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {item.clientEmail} · {item.assignedDate}
                  </ThemedText>
                  <ThemedText
                    type="smallBold"
                    themeColor={item.status === 'completed' ? undefined : 'textSecondary'}
                    style={item.status === 'completed' ? styles.statusCompleted : undefined}>
                    {item.status === 'completed' ? 'Completed' : 'Pending'}
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
  newButton: {
    ...Glow.oxblood,
    backgroundColor: Accent,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  newButtonText: {
    color: Colors.text,
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
  statusCompleted: {
    color: Colors.tealBright,
  },
  backButton: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
});
