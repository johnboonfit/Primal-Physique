import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { listMyAssignments, type ClientAssignmentSummary } from '@/lib/assignments';

export default function HomeScreen() {
  const { session, profile, loadingProfile, signOut } = useAuth();

  const [assignments, setAssignments] = useState<ClientAssignmentSummary[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(true);
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);

  // Only fetch for clients — coaches don't have assignments made "to" them,
  // and re-fetches every time this screen regains focus so a workout
  // assigned while you were away shows up when you come back to home.
  useFocusEffect(
    useCallback(() => {
      if (!session || profile?.role !== 'client') {
        setLoadingAssignments(false);
        return;
      }
      let cancelled = false;

      setLoadingAssignments(true);
      listMyAssignments(session.user.id)
        .then((data) => {
          if (!cancelled) setAssignments(data);
        })
        .catch((err) => {
          if (!cancelled) setAssignmentsError(err instanceof Error ? err.message : 'Failed to load your workouts.');
        })
        .finally(() => {
          if (!cancelled) setLoadingAssignments(false);
        });

      return () => {
        cancelled = true;
      };
    }, [session, profile?.role])
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="title" style={styles.title}>
              Primal Physique
            </ThemedText>

            {loadingProfile && <ThemedText themeColor="textSecondary">Loading your profile...</ThemedText>}

            {!loadingProfile && profile && (
              <ThemedText type="subtitle" style={styles.roleText}>
                You&apos;re logged in as{' '}
                <ThemedText type="subtitle" style={styles.roleHighlight}>
                  {profile.role === 'coach' ? 'Coach' : 'Client'}
                </ThemedText>
              </ThemedText>
            )}

            {!loadingProfile && !profile && (
              <ThemedText themeColor="textSecondary" style={styles.roleText}>
                We couldn&apos;t find a profile for this account. Check the profiles table in Supabase.
              </ThemedText>
            )}

            <ThemedText themeColor="textSecondary" type="small">
              {session?.user.email}
            </ThemedText>

            {profile?.role === 'coach' && (
              <Link href="/workouts" style={styles.linkSpacing}>
                <ThemedText type="linkPrimary">My Workouts</ThemedText>
              </Link>
            )}

            {profile?.role === 'coach' && (
              <Link href="/assignments" style={styles.linkSpacing}>
                <ThemedText type="linkPrimary">Assignments</ThemedText>
              </Link>
            )}
          </ThemedView>

          {profile?.role === 'client' && (
            <ThemedView style={styles.assignmentsSection}>
              <ThemedText type="smallBold">Your assigned workouts</ThemedText>

              {loadingAssignments && <ActivityIndicator style={styles.loader} />}

              {!loadingAssignments && assignmentsError && (
                <ThemedText style={styles.error}>{assignmentsError}</ThemedText>
              )}

              {!loadingAssignments && !assignmentsError && assignments.length === 0 && (
                <ThemedText themeColor="textSecondary">Nothing assigned yet.</ThemedText>
              )}

              {!loadingAssignments &&
                !assignmentsError &&
                assignments.map((assignment) => (
                  <Pressable key={assignment.id} onPress={() => router.push(`/assigned/${assignment.id}`)}>
                    <ThemedView type="backgroundElement" style={styles.assignmentRow}>
                      <ThemedText type="smallBold">{assignment.workoutName}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {assignment.assignedDate}
                      </ThemedText>
                    </ThemedView>
                  </Pressable>
                ))}
            </ThemedView>
          )}
        </ScrollView>

        <Pressable style={({ pressed }) => [styles.signOutButton, pressed && styles.pressed]} onPress={signOut}>
          <ThemedText type="smallBold" style={styles.signOutText}>
            Sign out
          </ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    gap: Spacing.three,
  },
  scrollContent: {
    gap: Spacing.three,
    paddingBottom: Spacing.three,
  },
  card: {
    borderRadius: Spacing.four,
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    gap: Spacing.three,
  },
  title: {
    textAlign: 'center',
  },
  roleText: {
    textAlign: 'center',
  },
  roleHighlight: {
    color: Accent,
  },
  linkSpacing: {
    marginTop: Spacing.two,
  },
  assignmentsSection: {
    gap: Spacing.two,
  },
  loader: {
    marginTop: Spacing.two,
  },
  error: {
    color: Accent,
  },
  assignmentRow: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  signOutButton: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Accent,
  },
  pressed: {
    opacity: 0.85,
  },
  signOutText: {
    color: Accent,
  },
});
