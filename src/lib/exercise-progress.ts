import { supabase } from '@/lib/supabase';

export type VolumeTrend = 'up' | 'maintaining' | 'down';

export type ExerciseHistorySummary = {
  exerciseLibraryId: string;
  exerciseName: string;
  sessionCount: number;
  lastPerformed: string;
  trend: VolumeTrend;
  bestWeight: number | null;
};

export type ExerciseSessionPoint = {
  assignmentId: string;
  date: string;
  volume: number;
  topSetWeight: number | null;
};

export type ExerciseVolumeHistory = {
  exerciseName: string;
  sessions: ExerciseSessionPoint[];
  trend: VolumeTrend;
  bestWeight: number | null;
  bestVolume: number | null;
  lastPerformed: string;
};

type ResolvedSet = {
  assignmentId: string;
  exerciseLibraryId: string | null;
  exerciseName: string;
  weight: number | null;
  reps: number | null;
};

/**
 * Every logged set for this client, across every assignment, with its
 * REAL exercise identity resolved — a swapped exercise's sets count
 * under the replacement exercise, not the originally-prescribed one,
 * the same swap-resolution getSessionScorecard() already does, just
 * for this client's whole history instead of one assignment.
 */
async function listResolvedSets(clientId: string): Promise<{ sets: ResolvedSet[]; assignedDateById: Map<string, string> }> {
  const [logsRes, assignmentsRes, swapsRes] = await Promise.all([
    supabase
      .from('workout_logs')
      .select('assignment_id, exercise_id, weight, reps, workout_exercises(exercise_library_id, name)')
      .eq('client_id', clientId),
    supabase.from('assignments').select('id, assigned_date').eq('client_id', clientId),
    supabase
      .from('assignment_exercise_swaps')
      .select('assignment_id, workout_exercise_id, replacement_exercise_library_id, replacement_name')
      .eq('client_id', clientId),
  ]);

  if (logsRes.error) throw logsRes.error;
  if (assignmentsRes.error) throw assignmentsRes.error;
  if (swapsRes.error) throw swapsRes.error;

  const assignedDateById = new Map<string, string>();
  (assignmentsRes.data ?? []).forEach((row) => {
    assignedDateById.set(row.id as string, row.assigned_date as string);
  });

  const swapBySlot = new Map<string, { exerciseLibraryId: string; name: string }>();
  (swapsRes.data ?? []).forEach((row) => {
    const key = `${row.assignment_id}:${row.workout_exercise_id}`;
    swapBySlot.set(key, {
      exerciseLibraryId: row.replacement_exercise_library_id as string,
      name: row.replacement_name as string,
    });
  });

  const sets: ResolvedSet[] = (logsRes.data ?? []).map((row) => {
    const assignmentId = row.assignment_id as string;
    const workoutExerciseId = row.exercise_id as string;
    const we = row.workout_exercises as unknown as { exercise_library_id: string | null; name: string } | null;
    const swap = swapBySlot.get(`${assignmentId}:${workoutExerciseId}`);
    return {
      assignmentId,
      exerciseLibraryId: swap ? swap.exerciseLibraryId : (we?.exercise_library_id ?? null),
      exerciseName: swap ? swap.name : (we?.name ?? 'Unknown exercise'),
      weight: row.weight as number | null,
      reps: row.reps as number | null,
    };
  });

  return { sets, assignedDateById };
}

/**
 * "Up," "maintaining," or "down" — compares the average of the most
 * recent sessions against the average of everything before them, with
 * a ±5% deadband so ordinary week-to-week noise doesn't flip the arrow.
 * The recent window is up to 3 sessions (fewer if there isn't much
 * history yet, down to a plain last-vs-previous comparison at exactly
 * 2 sessions) — a longer history smooths out one unusually good or bad
 * day without diluting a real recent shift, the same recency-weighting
 * reasoning training-readiness.ts's own trend uses. Fewer than 2
 * sessions is "maintaining" by default: not a real trend, just not
 * enough logged yet to call one.
 */
function computeTrend(volumesOldestFirst: number[]): VolumeTrend {
  if (volumesOldestFirst.length < 2) return 'maintaining';

  const recentCount = Math.max(1, Math.min(3, Math.floor(volumesOldestFirst.length / 2)));
  const recent = volumesOldestFirst.slice(-recentCount);
  const earlier = volumesOldestFirst.slice(0, -recentCount);

  const avg = (nums: number[]) => nums.reduce((sum, n) => sum + n, 0) / nums.length;
  const recentAvg = avg(recent);
  const earlierAvg = avg(earlier);

  if (earlierAvg === 0) return recentAvg > 0 ? 'up' : 'maintaining';

  const pctChange = (recentAvg - earlierAvg) / earlierAvg;
  if (pctChange > 0.05) return 'up';
  if (pctChange < -0.05) return 'down';
  return 'maintaining';
}

/**
 * One card per exercise this client has ever logged a set for, sorted
 * alphabetically by name — the Exercise sub-tab's list. Reuses the same
 * "group logged sets by resolved exercise identity" work
 * getExerciseVolumeHistory() below does per-exercise, just once for
 * every exercise at once so the list doesn't fire one query per card.
 */
export async function listExercisesWithHistory(clientId: string): Promise<ExerciseHistorySummary[]> {
  const { sets, assignedDateById } = await listResolvedSets(clientId);

  type SessionAgg = { date: string; volume: number; topWeight: number | null };
  const byExercise = new Map<string, { name: string; sessions: Map<string, SessionAgg> }>();

  sets.forEach((set) => {
    if (!set.exerciseLibraryId) return;
    const date = assignedDateById.get(set.assignmentId);
    if (!date) return;

    let entry = byExercise.get(set.exerciseLibraryId);
    if (!entry) {
      entry = { name: set.exerciseName, sessions: new Map() };
      byExercise.set(set.exerciseLibraryId, entry);
    }

    const volume = set.weight !== null && set.reps !== null ? set.weight * set.reps : 0;
    const session = entry.sessions.get(set.assignmentId) ?? { date, volume: 0, topWeight: null };
    session.volume += volume;
    if (set.weight !== null && (session.topWeight === null || set.weight > session.topWeight)) {
      session.topWeight = set.weight;
    }
    entry.sessions.set(set.assignmentId, session);
  });

  const summaries: ExerciseHistorySummary[] = [];
  byExercise.forEach((entry, exerciseLibraryId) => {
    const sessions = Array.from(entry.sessions.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
    const bestWeight = sessions.reduce<number | null>(
      (best, s) => (s.topWeight !== null && (best === null || s.topWeight > best) ? s.topWeight : best),
      null
    );
    summaries.push({
      exerciseLibraryId,
      exerciseName: entry.name,
      sessionCount: sessions.length,
      lastPerformed: sessions[sessions.length - 1].date,
      trend: computeTrend(sessions.map((s) => s.volume)),
      bestWeight,
    });
  });

  return summaries.sort((a, b) => a.exerciseName.localeCompare(b.exerciseName));
}

/** The full session-by-session volume history for one exercise —
 * what the progression graph and its stat row are built from. */
export async function getExerciseVolumeHistory(
  clientId: string,
  exerciseLibraryId: string
): Promise<ExerciseVolumeHistory | null> {
  const { sets, assignedDateById } = await listResolvedSets(clientId);

  const bySession = new Map<string, { date: string; volume: number; topWeight: number | null }>();
  let exerciseName: string | null = null;

  sets.forEach((set) => {
    if (set.exerciseLibraryId !== exerciseLibraryId) return;
    const date = assignedDateById.get(set.assignmentId);
    if (!date) return;
    exerciseName = set.exerciseName;

    const volume = set.weight !== null && set.reps !== null ? set.weight * set.reps : 0;
    const session = bySession.get(set.assignmentId) ?? { date, volume: 0, topWeight: null };
    session.volume += volume;
    if (set.weight !== null && (session.topWeight === null || set.weight > session.topWeight)) {
      session.topWeight = set.weight;
    }
    bySession.set(set.assignmentId, session);
  });

  if (exerciseName === null) return null;

  const sessions: ExerciseSessionPoint[] = Array.from(bySession.entries())
    .map(([assignmentId, s]) => ({ assignmentId, date: s.date, volume: s.volume, topSetWeight: s.topWeight }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const bestWeight = sessions.reduce<number | null>(
    (best, s) => (s.topSetWeight !== null && (best === null || s.topSetWeight > best) ? s.topSetWeight : best),
    null
  );
  const bestVolume = sessions.reduce<number | null>(
    (best, s) => (best === null || s.volume > best ? s.volume : best),
    null
  );

  return {
    exerciseName,
    sessions,
    trend: computeTrend(sessions.map((s) => s.volume)),
    bestWeight,
    bestVolume,
    lastPerformed: sessions[sessions.length - 1].date,
  };
}
