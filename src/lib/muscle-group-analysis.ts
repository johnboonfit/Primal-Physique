import { MUSCLE_GROUPS, type MuscleGroup } from '@/lib/exercise-library';
import { getCurrentWeekRange } from '@/lib/momentum';
import { supabase } from '@/lib/supabase';

export type MuscleGroupCounts = Record<MuscleGroup, number>;

export type WeeklyMuscleGroupAnalysis = {
  counts: MuscleGroupCounts;
  weekStart: string;
  weekEnd: string;
};

function emptyCounts(): MuscleGroupCounts {
  const counts = {} as MuscleGroupCounts;
  MUSCLE_GROUPS.forEach((group) => {
    counts[group.key] = 0;
  });
  return counts;
}

/**
 * How many sets this client has actually logged THIS WEEK (the same
 * Monday-Sunday window Momentum Score/the Leaderboard already use, via
 * getCurrentWeekRange -- "this week" means the same thing everywhere in
 * the app), grouped by muscle group.
 *
 * A workout_logs row only ever exists because a set was checked off, so
 * counting rows is already "sets actually done" -- this deliberately
 * includes sets already logged in a still-pending (in-progress) session,
 * not just completed ones, since the whole point of per-set logging is
 * that the work already happened the moment it was checked.
 *
 * Swap-aware, same as the PB/scorecard logic: a set logged against a
 * slot that was swapped mid-session counts toward the REPLACEMENT
 * exercise's muscle group, not the originally-prescribed one -- that's
 * what was actually performed.
 */
export async function getWeeklyMuscleGroupSetCounts(clientId: string): Promise<WeeklyMuscleGroupAnalysis> {
  const { start, end } = getCurrentWeekRange();
  const counts = emptyCounts();

  const { data: assignments, error: assignmentsError } = await supabase
    .from('assignments')
    .select('id')
    .eq('client_id', clientId)
    .gte('assigned_date', start)
    .lte('assigned_date', end);

  if (assignmentsError) throw assignmentsError;

  const assignmentIds = (assignments ?? []).map((row) => row.id as string);
  if (assignmentIds.length === 0) return { counts, weekStart: start, weekEnd: end };

  const [{ data: logs, error: logsError }, { data: swapRows, error: swapsError }] = await Promise.all([
    supabase
      .from('workout_logs')
      .select('assignment_id, exercise_id, workout_exercises(exercise_library_id)')
      .in('assignment_id', assignmentIds),
    supabase
      .from('assignment_exercise_swaps')
      .select('assignment_id, workout_exercise_id, replacement_exercise_library_id')
      .in('assignment_id', assignmentIds),
  ]);

  if (logsError) throw logsError;
  if (swapsError) throw swapsError;

  const swapByAssignmentAndSlot = new Map<string, string>();
  (swapRows ?? []).forEach((row) => {
    swapByAssignmentAndSlot.set(
      `${row.assignment_id}:${row.workout_exercise_id}`,
      row.replacement_exercise_library_id as string
    );
  });

  const libraryIds = new Set<string>();
  const resolvedLibraryIdPerLog = (logs ?? []).map((row) => {
    const we = row.workout_exercises as unknown as { exercise_library_id: string | null } | null;
    const swapped = swapByAssignmentAndSlot.get(`${row.assignment_id}:${row.exercise_id}`);
    const libraryId = swapped ?? we?.exercise_library_id ?? null;
    if (libraryId) libraryIds.add(libraryId);
    return libraryId;
  });

  if (libraryIds.size === 0) return { counts, weekStart: start, weekEnd: end };

  const { data: libraryRows, error: libraryError } = await supabase
    .from('exercise_library')
    .select('id, muscle_group')
    .in('id', Array.from(libraryIds));

  if (libraryError) throw libraryError;

  const muscleGroupByLibraryId = new Map<string, MuscleGroup>();
  (libraryRows ?? []).forEach((row) => {
    muscleGroupByLibraryId.set(row.id as string, row.muscle_group as MuscleGroup);
  });

  resolvedLibraryIdPerLog.forEach((libraryId) => {
    if (!libraryId) return;
    const muscleGroup = muscleGroupByLibraryId.get(libraryId);
    if (!muscleGroup) return;
    counts[muscleGroup] += 1;
  });

  return { counts, weekStart: start, weekEnd: end };
}

export type VolumeTier = 'low' | 'moderate' | 'high';

/** Green under 10, yellow 10-19, red 20+ -- one muscle group's own weekly
 * set count. */
export function tierForSetCount(count: number): VolumeTier {
  if (count >= 20) return 'high';
  if (count >= 10) return 'moderate';
  return 'low';
}

/**
 * The overall status badge: the WORST tier reached by any single muscle
 * group, not an average across all of them. A single muscle group
 * pushed into the red is worth flagging on its own regardless of how
 * quiet everything else is -- averaging it away against several quiet
 * groups would hide exactly the thing this card exists to catch.
 */
export function overallVolumeStatus(counts: MuscleGroupCounts): VolumeTier {
  const tiers = Object.values(counts).map(tierForSetCount);
  if (tiers.includes('high')) return 'high';
  if (tiers.includes('moderate')) return 'moderate';
  return 'low';
}
