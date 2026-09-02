import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HeroStat } from '@/components/hero-stat';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import {
  autoRescheduleOverdueAssignments,
  listMyAssignments,
  rescheduleAssignment,
  type AutoRescheduleResult,
  type ClientAssignmentSummary,
  type OverdueAssignment,
} from '@/lib/assignments';
import { listFoodLogsForDate } from '@/lib/food-logs';
import { ensureCheckInsUpToDate, listUpNextCheckIns, type UpNextCheckIn } from '@/lib/form-check-ins';
import { completeHabit, listMyHabits, listTodaysCompletedHabitIds, type MyHabit } from '@/lib/habits';
import { getMomentumScore, type MomentumBreakdown } from '@/lib/momentum';
import { getCurrentStreak } from '@/lib/streak';
import { checkAndRecalculateTdeeIfDue } from '@/lib/tdee';
import { hasWeightLogForDate } from '@/lib/weight-logs';
import { awardHabitXp, getXpSummary, type XpSummary } from '@/lib/xp';

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

/** Whatever "the next thing to do" actually is — a pending workout or a
 * due check-in — reduced to just what the Up Next card needs to render,
 * so both kinds share one list and one card style. */
type UpNextItem = {
  kind: 'workout' | 'checkin';
  id: string;
  title: string;
  date: string;
};

export default function ClientHomeScreen() {
  const { session, profile, signOut } = useAuth();
  const theme = useTheme();

  const [assignments, setAssignments] = useState<ClientAssignmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [checkIns, setCheckIns] = useState<UpNextCheckIn[]>([]);
  const [checkInsLoading, setCheckInsLoading] = useState(true);
  const [checkInsError, setCheckInsError] = useState<string | null>(null);

  const [habits, setHabits] = useState<MyHabit[]>([]);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [habitsLoading, setHabitsLoading] = useState(true);
  const [habitsError, setHabitsError] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);

  const [momentum, setMomentum] = useState<MomentumBreakdown | null>(null);
  const [momentumLoading, setMomentumLoading] = useState(true);
  const [momentumError, setMomentumError] = useState<string | null>(null);

  const [xp, setXp] = useState<XpSummary | null>(null);
  const [xpLoading, setXpLoading] = useState(true);

  const [streak, setStreak] = useState<number | null>(null);

  const [weightLoggedToday, setWeightLoggedToday] = useState<boolean | null>(null);
  const [foodLoggedToday, setFoodLoggedToday] = useState<boolean | null>(null);

  // One-time banner for workouts the app moved on its own this session.
  const [movedNotice, setMovedNotice] = useState<AutoRescheduleResult['moved']>([]);
  // Persists until the client picks a date for each — every day this
  // week was already full, so the app won't guess.
  const [needsManual, setNeedsManual] = useState<OverdueAssignment[]>([]);
  const [manualDates, setManualDates] = useState<Record<string, string>>({});
  const [manualSavingId, setManualSavingId] = useState<string | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);

  const logDate = todayISODate();

  // Reuses the same query the Training tab uses — "Up Next" is just the
  // pending ones, filtered client-side rather than a second database call.
  const loadAssignments = useCallback(() => {
    if (!session) return;
    setLoading(true);
    listMyAssignments(session.user.id)
      .then((data) => setAssignments(data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load your workouts.'))
      .finally(() => setLoading(false));
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      loadAssignments();
    }, [loadAssignments])
  );

  // Runs once when the app opens (not on every tab visit) rather than as
  // a background job — with one coach and a handful of clients, checking
  // at open time is simple, has no server infrastructure to run or
  // monitor, and catches a missed workout the moment the client would
  // actually see it. A nightly job would only be worth the extra moving
  // parts once reminders need to go out even when the client doesn't
  // open the app.
  useEffect(() => {
    if (!session) return;
    autoRescheduleOverdueAssignments(session.user.id)
      .then(({ moved, needsManual: manual }) => {
        if (moved.length > 0) {
          setMovedNotice(moved);
          loadAssignments();
        }
        if (manual.length > 0) {
          setNeedsManual(manual);
          setManualDates((current) => {
            const next = { ...current };
            manual.forEach((item) => {
              if (!next[item.id]) next[item.id] = todayISODate();
            });
            return next;
          });
        }
      })
      .catch((err) => console.error('Failed to check for overdue workouts:', err));
    // Deliberately only re-runs if the signed-in user changes — this is
    // an "on app open" check, not a "keep re-checking" one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // Reuses the same "Up Next" section the workout list already renders
  // into — a check-in is just another kind of item in that list, not a
  // separate section with its own display logic.
  const loadCheckIns = useCallback(() => {
    if (!session) return;
    setCheckInsLoading(true);
    listUpNextCheckIns(session.user.id)
      .then((data) => setCheckIns(data))
      .catch((err) => setCheckInsError(err instanceof Error ? err.message : 'Failed to load your check-ins.'))
      .finally(() => setCheckInsLoading(false));
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      loadCheckIns();
    }, [loadCheckIns])
  );

  // Same "on app open" shape as the missed-workout auto-reschedule
  // above, and for the same reason: materializing a check-in that
  // should exist by now (and archiving any gone stale) only needs to
  // happen once the client's actually looking, not on a schedule
  // nobody's watching. Runs before the first fetch so Up Next never
  // shows a moment-stale list right after opening the app.
  useEffect(() => {
    if (!session) return;
    ensureCheckInsUpToDate(session.user.id)
      .then(() => loadCheckIns())
      .catch((err) => console.error('Failed to update check-in schedule:', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // Same "on app open" simplification as the overdue-workout check above,
  // and for the same reason: no scheduled job to build or monitor, and a
  // calorie target that's a day or two late to refresh because the
  // client didn't open the app costs nothing (they just keep eating at
  // last week's number a little longer). checkAndRecalculateTdeeIfDue
  // itself is a no-op unless 7+ days have passed AND the data-quality
  // gate still passes, so calling it here every app open is cheap and
  // correct even though this effect fires every time.
  useEffect(() => {
    if (!session) return;
    checkAndRecalculateTdeeIfDue(session.user.id, logDate).catch((err) =>
      console.error('Failed to check whether TDEE needs recalculating:', err)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

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

  const loadXp = useCallback(() => {
    if (!session) return;
    setXpLoading(true);
    getXpSummary(session.user.id)
      .then(setXp)
      .catch((err) => console.error('Failed to load XP:', err))
      .finally(() => setXpLoading(false));
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      loadXp();
    }, [loadXp])
  );

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      let cancelled = false;

      getCurrentStreak(session.user.id)
        .then((value) => {
          if (!cancelled) setStreak(value);
        })
        .catch((err) => console.error('Failed to calculate streak:', err));

      return () => {
        cancelled = true;
      };
    }, [session])
  );

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      let cancelled = false;

      Promise.all([hasWeightLogForDate(session.user.id, logDate), listFoodLogsForDate(session.user.id, logDate)])
        .then(([weightLogged, foodLogs]) => {
          if (cancelled) return;
          setWeightLoggedToday(weightLogged);
          setFoodLoggedToday(foodLogs.length > 0);
        })
        .catch((err) => console.error("Failed to check today's logging status:", err));

      return () => {
        cancelled = true;
      };
    }, [session, logDate])
  );

  const handleManualReschedule = async (assignmentId: string) => {
    setManualError(null);
    const newDate = manualDates[assignmentId] ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
      setManualError('Enter the date as YYYY-MM-DD.');
      return;
    }

    setManualSavingId(assignmentId);
    try {
      await rescheduleAssignment(assignmentId, newDate);
      setNeedsManual((current) => current.filter((item) => item.id !== assignmentId));
      loadAssignments();
    } catch (err) {
      setManualError(err instanceof Error ? err.message : 'Something went wrong saving that date.');
    } finally {
      setManualSavingId(null);
    }
  };

  const handleCompleteHabit = async (habitId: string) => {
    if (!session || completedIds.has(habitId)) return;
    setCompletingId(habitId);
    try {
      await completeHabit(habitId, session.user.id, logDate);
      setCompletedIds((current) => new Set(current).add(habitId));
      // Same "don't let the bonus layer break the core action" rule as
      // the other two award points.
      try {
        await awardHabitXp(session.user.id, habitId, logDate);
        loadXp();
      } catch (xpErr) {
        console.error('Failed to award habit XP:', xpErr);
      }
    } catch (err) {
      setHabitsError(err instanceof Error ? err.message : 'Failed to save that.');
    } finally {
      setCompletingId(null);
    }
  };

  // One merged, date-sorted list — a check-in is rendered in the exact
  // same Up Next section and card as a pending workout, just with its
  // own destination and button label, rather than a second section
  // with its own display logic.
  const upNext: UpNextItem[] = [
    ...assignments
      .filter((assignment) => assignment.status === 'pending')
      .map((assignment) => ({
        kind: 'workout' as const,
        id: assignment.id,
        title: assignment.workoutName,
        date: assignment.assignedDate,
      })),
    ...checkIns.map((checkIn) => ({
      kind: 'checkin' as const,
      id: checkIn.id,
      title: checkIn.formName,
      date: checkIn.scheduledDate,
    })),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const upNextLoading = loading || checkInsLoading;
  const upNextError = error || checkInsError;

  const displayName = profile?.full_name || profile?.email.split('@')[0] || '';
  const completedCount = habits.filter((habit) => completedIds.has(habit.id)).length;

  const missingWeight = weightLoggedToday === false;
  const missingFood = foodLoggedToday === false;
  let loggingNudge: { message: string; href: '/client/progress' | '/client/nutrition' } | null = null;
  if (missingWeight && missingFood) {
    loggingNudge = {
      message: "Log today's weight and meals for more accurate calorie targets.",
      href: '/client/progress',
    };
  } else if (missingWeight) {
    loggingNudge = { message: "Log today's weight for more accurate calorie targets.", href: '/client/progress' };
  } else if (missingFood) {
    loggingNudge = { message: "Log today's meals for more accurate calorie targets.", href: '/client/nutrition' };
  }

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

          {streak !== null && (
            <View style={styles.streakRow}>
              <ThemedText type="smallBold" style={styles.streakText}>
                🔥 {streak}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                day streak
              </ThemedText>
            </View>
          )}

          {loggingNudge && (
            <Pressable onPress={() => router.push(loggingNudge!.href)}>
              <ThemedView type="backgroundElement" style={styles.nudgeCard}>
                <ThemedText type="smallBold" style={styles.nudgeText}>
                  {loggingNudge.message}
                </ThemedText>
              </ThemedView>
            </Pressable>
          )}

          {movedNotice.length > 0 && (
            <ThemedView type="backgroundElement" style={styles.noticeCard}>
              <View style={styles.noticeHeader}>
                <ThemedText type="smallBold">Rescheduled for you</ThemedText>
                <Pressable onPress={() => setMovedNotice([])}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Dismiss
                  </ThemedText>
                </Pressable>
              </View>
              {movedNotice.map((item) => (
                <ThemedText key={item.id} type="small" themeColor="textSecondary">
                  {item.workoutName}: {item.oldDate} → {item.newDate}
                </ThemedText>
              ))}
            </ThemedView>
          )}

          {needsManual.length > 0 && (
            <ThemedView type="backgroundElement" style={styles.noticeCard}>
              <ThemedText type="smallBold">Pick a new date</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Every day this week is already booked, so these need your call.
              </ThemedText>
              {needsManual.map((item) => (
                <View key={item.id} style={styles.manualRow}>
                  <ThemedText type="small" style={styles.manualLabel}>
                    {item.workoutName} (was {item.oldDate})
                  </ThemedText>
                  <TextInput
                    value={manualDates[item.id] ?? ''}
                    onChangeText={(value) => setManualDates((current) => ({ ...current, [item.id]: value }))}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={theme.textSecondary}
                    style={[styles.manualInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
                  />
                  <Pressable
                    style={({ pressed }) => [styles.manualSaveButton, pressed && styles.pressed]}
                    onPress={() => handleManualReschedule(item.id)}
                    disabled={manualSavingId === item.id}>
                    {manualSavingId === item.id ? (
                      <ActivityIndicator size="small" color={Colors.text} />
                    ) : (
                      <ThemedText type="smallBold" style={styles.manualSaveText}>
                        Save
                      </ThemedText>
                    )}
                  </Pressable>
                </View>
              ))}
              {manualError && <ThemedText style={styles.error}>{manualError}</ThemedText>}
            </ThemedView>
          )}

          {!xpLoading && xp && (
            <ThemedView type="backgroundElement" style={styles.xpCard}>
              <View style={styles.xpHeader}>
                <ThemedText type="smallBold">Level {xp.level}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {xp.totalXp} XP
                </ThemedText>
              </View>
              <View style={styles.xpTrack}>
                <View style={[styles.xpFill, { width: `${((xp.totalXp % 500) / 500) * 100}%` }]} />
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                {xp.totalXp % 500}/500 to Level {xp.level + 1}
              </ThemedText>
            </ThemedView>
          )}

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
            {!upNextLoading && !upNextError && upNext.length > 0 && (
              <ThemedText type="smallBold" themeColor="textSecondary">
                {upNext.length} pending
              </ThemedText>
            )}
          </View>

          {upNextLoading && <ActivityIndicator style={styles.loader} />}

          {!upNextLoading && upNextError && <ThemedText style={styles.error}>{upNextError}</ThemedText>}

          {!upNextLoading && !upNextError && upNext.length === 0 && (
            <ThemedText themeColor="textSecondary">Nothing pending — you&apos;re all caught up.</ThemedText>
          )}

          {!upNextLoading &&
            !upNextError &&
            upNext.map((item) => (
              <ThemedView key={`${item.kind}-${item.id}`} type="backgroundElement" style={styles.upNextCard}>
                <View style={styles.upNextInfo}>
                  <ThemedText type="smallBold">{item.title}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {item.date}
                  </ThemedText>
                </View>
                <Pressable
                  style={({ pressed }) => [styles.startButton, pressed && styles.pressed]}
                  onPress={() => router.push(item.kind === 'workout' ? `/assigned/${item.id}` : `/checkins/${item.id}`)}>
                  <ThemedText type="smallBold" style={styles.startButtonText}>
                    {item.kind === 'workout' ? 'Start' : 'Fill out'}
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
  xpCard: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  xpHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  xpTrack: {
    width: '100%',
    height: 8,
    borderRadius: 999,
    backgroundColor: Colors.backgroundSelected,
    overflow: 'hidden',
  },
  xpFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: Colors.tealBright,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.half,
  },
  streakText: {
    color: Colors.tealBright,
  },
  noticeCard: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  nudgeCard: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    borderLeftWidth: 3,
    borderLeftColor: Accent,
  },
  nudgeText: {
    color: Colors.text,
  },
  noticeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  manualRow: {
    gap: Spacing.two,
  },
  manualLabel: {
    marginBottom: Spacing.half,
  },
  manualInput: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 14,
  },
  manualSaveButton: {
    ...Glow.oxblood,
    backgroundColor: Accent,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualSaveText: {
    color: Colors.text,
  },
});
