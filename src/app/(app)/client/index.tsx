import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HeroStat } from '@/components/hero-stat';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { listMyAssignments, type ClientAssignmentSummary } from '@/lib/assignments';

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function ClientHomeScreen() {
  const { session, profile, signOut } = useAuth();

  const [assignments, setAssignments] = useState<ClientAssignmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reuses the same query the Training tab uses — "Up Next" is just the
  // pending ones, filtered client-side rather than a second database call.
  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      let cancelled = false;

      setLoading(true);
      listMyAssignments(session.user.id)
        .then((data) => {
          if (!cancelled) setAssignments(data);
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load your workouts.');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }, [session])
  );

  const upNext = assignments.filter((assignment) => assignment.status === 'pending');
  const displayName = profile?.full_name || profile?.email.split('@')[0] || '';

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <ThemedText type="title" style={styles.greeting}>
              {getGreeting()}, {displayName}
            </ThemedText>
            <Pressable onPress={signOut}>
              <ThemedText type="linkPrimary">Sign out</ThemedText>
            </Pressable>
          </View>

          {!loading && !error && <HeroStat value={upNext.length} label="Workouts Up Next" />}

          <ThemedText type="smallBold" style={styles.sectionLabel}>
            Up Next
          </ThemedText>

          {loading && <ActivityIndicator style={styles.loader} />}

          {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}

          {!loading && !error && upNext.length === 0 && (
            <ThemedText themeColor="textSecondary">Nothing pending — you&apos;re all caught up.</ThemedText>
          )}

          {!loading &&
            !error &&
            upNext.map((assignment) => (
              <ThemedView key={assignment.id} type="backgroundElement" style={styles.upNextCard}>
                <View style={styles.upNextInfo}>
                  <ThemedText type="smallBold">{assignment.workoutName}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {assignment.assignedDate}
                  </ThemedText>
                </View>
                <Pressable
                  style={({ pressed }) => [styles.startButton, pressed && styles.pressed]}
                  onPress={() => router.push(`/assigned/${assignment.id}`)}>
                  <ThemedText type="smallBold" style={styles.startButtonText}>
                    Start
                  </ThemedText>
                </Pressable>
              </ThemedView>
            ))}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.four },
  scrollContent: {
    gap: Spacing.three,
    paddingBottom: Spacing.four,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  greeting: {
    flex: 1,
  },
  sectionLabel: {
    marginTop: Spacing.two,
  },
  loader: {
    marginTop: Spacing.two,
  },
  error: {
    color: Accent,
  },
  upNextCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  upNextInfo: {
    flex: 1,
    gap: Spacing.half,
  },
  startButton: {
    ...Glow.oxblood,
    backgroundColor: Accent,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  pressed: {
    opacity: 0.85,
  },
  startButtonText: {
    color: Colors.text,
  },
});
