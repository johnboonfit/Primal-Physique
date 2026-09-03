import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HeroStat } from '@/components/hero-stat';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WorkoutAnalyserCard } from '@/components/workout-analyser-card';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { listMyAssignments, type ClientAssignmentSummary } from '@/lib/assignments';
import { getWeeklyMuscleGroupSetCounts, type MuscleGroupCounts } from '@/lib/muscle-group-analysis';
import { getClientProgramme, GOAL_TYPES, type ClientProgrammeView } from '@/lib/programmes';

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function goalLabel(goalType: ClientProgrammeView['goalType']) {
  return GOAL_TYPES.find((g) => g.key === goalType)?.label ?? goalType;
}

function displayDate(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  });
}

function ProgrammeCard({ programme }: { programme: ClientProgrammeView }) {
  return (
    <ThemedView type="backgroundElement" style={styles.programmeCard}>
      {programme.coverImageUrl ? (
        <Image source={{ uri: programme.coverImageUrl }} style={styles.coverImage} contentFit="cover" />
      ) : null}

      <View style={styles.programmeHeaderRow}>
        <ThemedText type="smallBold" style={styles.programmeName}>
          {programme.name}
        </ThemedText>
        <ThemedText type="small" style={styles.weekBadge}>
          {programme.hasStarted
            ? `Week ${programme.currentWeekNumber}/${programme.durationWeeks}`
            : `Starts ${displayDate(programme.startDate)}`}
        </ThemedText>
      </View>

      <ThemedText type="small" themeColor="textSecondary">
        {goalLabel(programme.goalType)}
      </ThemedText>

      {programme.description && (
        <ThemedText type="small" themeColor="textSecondary">
          {programme.description}
        </ThemedText>
      )}

      <View style={styles.dayRow}>
        {programme.weekProgress.map((day) => {
          const weekday = new Date(`${day.date}T00:00:00.000Z`).getUTCDay();
          return (
            <View key={day.date} style={[styles.dayCell, day.completed && styles.dayCellCompleted]}>
              <ThemedText type="small" themeColor={day.completed ? undefined : 'textSecondary'} style={day.completed ? styles.dayCheckText : undefined}>
                {day.completed ? '✓' : DAY_LETTERS[weekday]}
              </ThemedText>
            </View>
          );
        })}
      </View>

      <ThemedText type="small" themeColor="textSecondary">
        {programme.sessionsCompletedThisWeek}/{programme.sessionsScheduledThisWeek} sessions completed this week
      </ThemedText>

      {programme.mostRecentCompleted && (
        <ThemedText type="small" themeColor="textSecondary">
          Last completed: {programme.mostRecentCompleted.workoutName} · {displayDate(programme.mostRecentCompleted.date)}
        </ThemedText>
      )}

      <View style={styles.divider} />

      <ThemedText type="smallBold">Next Workout</ThemedText>
      {programme.nextUpcoming ? (
        <View style={styles.nextRow}>
          <View style={styles.nextInfo}>
            <ThemedText type="smallBold">{programme.nextUpcoming.workoutName}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {displayDate(programme.nextUpcoming.date)}
            </ThemedText>
          </View>
          <Pressable
            style={({ pressed }) => [styles.startButton, pressed && styles.pressed]}
            onPress={() => router.push(`/assigned/${programme.nextUpcoming!.assignmentId}`)}>
            <ThemedText type="smallBold" style={styles.startButtonText}>
              Start
            </ThemedText>
          </Pressable>
        </View>
      ) : (
        <ThemedText themeColor="textSecondary" type="small">
          Nothing left to do in this programme — nice work.
        </ThemedText>
      )}
    </ThemedView>
  );
}

export default function ClientTrainingScreen() {
  const { session } = useAuth();
  const [assignments, setAssignments] = useState<ClientAssignmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [programme, setProgramme] = useState<ClientProgrammeView | null>(null);
  const [programmeLoading, setProgrammeLoading] = useState(true);
  const [programmeError, setProgrammeError] = useState<string | null>(null);

  const [muscleCounts, setMuscleCounts] = useState<MuscleGroupCounts | null>(null);

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

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      let cancelled = false;

      setProgrammeLoading(true);
      getClientProgramme(session.user.id)
        .then((data) => {
          if (!cancelled) setProgramme(data);
        })
        .catch((err) => {
          if (!cancelled) setProgrammeError(err instanceof Error ? err.message : 'Failed to load your programme.');
        })
        .finally(() => {
          if (!cancelled) setProgrammeLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }, [session])
  );

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      let cancelled = false;

      getWeeklyMuscleGroupSetCounts(session.user.id)
        .then((data) => {
          if (!cancelled) setMuscleCounts(data.counts);
        })
        .catch(() => {
          // Non-critical stat card -- fail quietly rather than blocking the rest of the tab.
        });

      return () => {
        cancelled = true;
      };
    }, [session])
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText type="title" style={styles.title}>
            Training
          </ThemedText>
          <Pressable onPress={() => router.push('/client/calendar')}>
            <ThemedText type="linkPrimary">View Calendar →</ThemedText>
          </Pressable>
        </View>

        {!loading && !error && <HeroStat value={assignments.length} label="Workouts Assigned" />}

        <FlatList
          data={assignments}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <>
              {programmeLoading && <ActivityIndicator style={styles.loader} />}
              {!programmeLoading && programmeError && <ThemedText style={styles.error}>{programmeError}</ThemedText>}
              {!programmeLoading && !programmeError && programme && (
                <>
                  <ThemedText type="smallBold" style={styles.sectionLabel}>
                    Your Programme
                  </ThemedText>
                  <ProgrammeCard programme={programme} />
                </>
              )}
              {!programmeLoading && !programmeError && !programme && (
                <ThemedText themeColor="textSecondary" style={styles.noProgramme}>
                  No programme assigned yet — check back once your coach assigns one.
                </ThemedText>
              )}

              {muscleCounts && (
                <>
                  <ThemedText type="smallBold" style={styles.sectionLabel}>
                    This Week
                  </ThemedText>
                  <WorkoutAnalyserCard counts={muscleCounts} />
                </>
              )}

              <ThemedText type="smallBold" style={styles.sectionLabel}>
                All Assignments
              </ThemedText>

              {loading && <ActivityIndicator style={styles.loader} />}
              {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}
              {!loading && !error && assignments.length === 0 && (
                <ThemedText themeColor="textSecondary" style={styles.empty}>
                  Nothing assigned yet.
                </ThemedText>
              )}
            </>
          }
          renderItem={({ item }) => (
            <Pressable onPress={() => router.push(`/assigned/${item.id}`)}>
              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText type="smallBold">{item.workoutName}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {item.assignedDate}
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
  title: {},
  sectionLabel: {
    marginTop: Spacing.three,
    marginBottom: Spacing.two,
  },
  loader: {
    marginTop: Spacing.two,
  },
  error: {
    color: Accent,
    textAlign: 'center',
    marginTop: Spacing.two,
  },
  empty: {
    textAlign: 'center',
    marginTop: Spacing.two,
  },
  noProgramme: {
    marginTop: Spacing.two,
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
  programmeCard: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  coverImage: {
    width: '100%',
    height: 120,
    borderRadius: Spacing.two,
  },
  programmeHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  programmeName: {
    flex: 1,
  },
  weekBadge: {
    color: Colors.tealBright,
  },
  dayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.half,
  },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.backgroundSelected,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellCompleted: {
    backgroundColor: Colors.tealDeep,
    borderColor: Colors.tealBright,
  },
  dayCheckText: {
    color: Colors.tealBright,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.backgroundSelected,
    marginVertical: Spacing.half,
  },
  nextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  nextInfo: {
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
