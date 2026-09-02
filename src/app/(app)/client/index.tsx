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
import { completeHabit, listMyHabits, listTodaysCompletedHabitIds, type MyHabit } from '@/lib/habits';
import { getMomentumScore, type MomentumBreakdown } from '@/lib/momentum';

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

export default function ClientHomeScreen() {
  const { session, profile, signOut } = useAuth();

  const [assignments, setAssignments] = useState<ClientAssignmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [habits, setHabits] = useState<MyHabit[]>([]);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [habitsLoading, setHabitsLoading] = useState(true);
  const [habitsError, setHabitsError] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);

  const [momentum, setMomentum] = useState<MomentumBreakdown | null>(null);
  const [momentumLoading, setMomentumLoading] = useState(true);
  const [momentumError, setMomentumError] = useState<string | null>(null);

  const logDate = todayISODate();

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

  const loadHabits = useCallback(() => {
    if (!session) return;
    setHabitsLoading(true);
    Promise.all([listMyHabits(session.user.id), listTodaysCompletedHabitIds(session.user.id, logDate)])
      .then(([habitList, completed]) => {
        setHabits(habitList);
        setCompletedIds(completed);
      })
      .catch((err) => setHabitsError(err instanceof Error ? err.message : 'Failed to load your habits.'))
      .finally(() => setHabitsLoading(false));
  }, [session, logDate]);

  useFocusEffect(
    useCallback(() => {
      loadHabits();
    }, [loadHabits])
  );

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      let cancelled = false;

      setMomentumLoading(true);
      getMomentumScore(session.user.id)
        .then((data) => {
          if (!cancelled) setMomentum(data);
        })
        .catch((err) => {
          if (!cancelled) setMomentumError(err instanceof Error ? err.message : 'Failed to calculate your score.');
        })
        .finally(() => {
          if (!cancelled) setMomentumLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }, [session])
  );

  const handleCompleteHabit = async (habitId: string) => {
    if (!session || completedIds.has(habitId)) return;
    setCompletingId(habitId);
    try {
      await completeHabit(habitId, session.user.id, logDate);
      setCompletedIds((current) => new Set(current).add(habitId));
    } catch (err) {
      setHabitsError(err instanceof Error ? err.message : 'Failed to save that.');
    } finally {
      setCompletingId(null);
    }
  };

  const upNext = assignments.filter((assignment) => assignment.status === 'pending');
  const displayName = profile?.full_name || profile?.email.split('@')[0] || '';
  const completedCount = habits.filter((habit) => completedIds.has(habit.id)).length;

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

          {momentumLoading && <ActivityIndicator style={styles.loader} />}

          {!momentumLoading && momentumError && <ThemedText style={styles.error}>{momentumError}</ThemedText>}

          {!momentumLoading && !momentumError && momentum && (
            <HeroStat
              value={momentum.score.toFixed(2)}
              label="Momentum Score"
              progress={(momentum.score - 1) / 9}
            />
          )}

          <View style={styles.sectionHeaderRow}>
            <ThemedText type="smallBold" style={styles.sectionLabel}>
              Up Next
            </ThemedText>
            {!loading && !error && upNext.length > 0 && (
              <ThemedText type="smallBold" themeColor="textSecondary">
                {upNext.length} pending
              </ThemedText>
            )}
          </View>

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

          <View style={styles.sectionHeaderRow}>
            <ThemedText type="smallBold">Today's Habits</ThemedText>
            {!habitsLoading && !habitsError && habits.length > 0 && (
              <ThemedText type="smallBold" style={styles.habitsCount}>
                {completedCount}/{habits.length} today
              </ThemedText>
            )}
          </View>

          {habitsLoading && <ActivityIndicator style={styles.loader} />}

          {!habitsLoading && habitsError && <ThemedText style={styles.error}>{habitsError}</ThemedText>}

          {!habitsLoading && !habitsError && habits.length === 0 && (
            <ThemedText themeColor="textSecondary">No habits set yet.</ThemedText>
          )}

          {!habitsLoading &&
            !habitsError &&
            habits.map((habit) => {
              const done = completedIds.has(habit.id);
              return (
                <Pressable key={habit.id} onPress={() => handleCompleteHabit(habit.id)} disabled={done}>
                  <ThemedView type="backgroundElement" style={styles.habitRow}>
                    <ThemedText type="smallBold" style={done ? styles.habitDoneText : undefined}>
                      {habit.name}
                    </ThemedText>
                    {completingId === habit.id ? (
                      <ActivityIndicator size="small" />
                    ) : (
                      <ThemedText type="smallBold" style={done ? styles.habitCheckDone : styles.habitCheckPending}>
                        {done ? '✓' : '○'}
                      </ThemedText>
                    )}
                  </ThemedView>
                </Pressable>
              );
            })}
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
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  habitsCount: {
    color: Colors.tealBright,
  },
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: Spacing.two,
    padding: Spacing.three,
  },
  habitDoneText: {
    color: Colors.textSecondary,
  },
  habitCheckDone: {
    color: Colors.tealBright,
  },
  habitCheckPending: {
    color: Colors.textSecondary,
  },
});
