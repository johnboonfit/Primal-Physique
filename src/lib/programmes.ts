import { supabase } from '@/lib/supabase';

export type GoalType = 'cutting' | 'bulking' | 'recomp' | 'strength';

export const GOAL_TYPES: { key: GoalType; label: string }[] = [
  { key: 'cutting', label: 'Cutting' },
  { key: 'bulking', label: 'Bulking' },
  { key: 'recomp', label: 'Recomp' },
  { key: 'strength', label: 'Strength' },
];

export type ScheduledDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export const SCHEDULED_DAYS: { key: ScheduledDay; label: string }[] = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
];

export type ProgrammeDraft = {
  name: string;
  description: string;
  coverImageUrl: string;
  goalType: GoalType;
  durationWeeks: number;
  scheduledDays: ScheduledDay[];
};

export type ProgrammeSummary = {
  id: string;
  name: string;
  description: string | null;
  coverImageUrl: string | null;
  goalType: GoalType;
  durationWeeks: number;
  scheduledDays: ScheduledDay[];
  createdAt: string;
  weekCount: number;
};

export type ProgrammeWeekSummary = {
  id: string;
  weekNumber: number;
  workoutCount: number;
};

export type ProgrammeDetail = ProgrammeSummary & {
  weeks: ProgrammeWeekSummary[];
};

export type ProgrammeWeekContext = {
  programmeId: string;
  programmeName: string;
  weekNumber: number;
};

/**
 * Creates the programme, then immediately creates one programme_weeks row
 * for every week in its duration — the coach already said how many weeks
 * it runs, so there's no reason to make them add each one by hand. More
 * can still be added later (e.g. an extra deload week) from the
 * programme screen. If creating the weeks fails, the half-saved
 * programme is cleaned up rather than left behind empty.
 */
export async function createProgramme(coachId: string, draft: ProgrammeDraft): Promise<string> {
  const { data: programme, error: programmeError } = await supabase
    .from('programme_blocks')
    .insert({
      coach_id: coachId,
      name: draft.name,
      description: draft.description || null,
      cover_image_url: draft.coverImageUrl || null,
      goal_type: draft.goalType,
      duration_weeks: draft.durationWeeks,
      scheduled_days: draft.scheduledDays,
    })
    .select('id')
    .single();

  if (programmeError) throw programmeError;

  const weekRows = Array.from({ length: draft.durationWeeks }, (_, index) => ({
    programme_id: programme.id as string,
    week_number: index + 1,
  }));

  const { error: weeksError } = await supabase.from('programme_weeks').insert(weekRows);

  if (weeksError) {
    await supabase.from('programme_blocks').delete().eq('id', programme.id);
    throw weeksError;
  }

  return programme.id as string;
}

/** Templates only — a programme with client_id set is a client's own
 * assigned instance, not something to offer for reuse or duplication. */
export async function listProgrammes(coachId: string): Promise<ProgrammeSummary[]> {
  const { data, error } = await supabase
    .from('programme_blocks')
    .select(
      'id, name, description, cover_image_url, goal_type, duration_weeks, scheduled_days, created_at, programme_weeks(count)'
    )
    .eq('coach_id', coachId)
    .is('client_id', null)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    description: row.description as string | null,
    coverImageUrl: row.cover_image_url as string | null,
    goalType: row.goal_type as GoalType,
    durationWeeks: row.duration_weeks as number,
    scheduledDays: (row.scheduled_days as ScheduledDay[] | null) ?? [],
    createdAt: row.created_at as string,
    weekCount: (row.programme_weeks as { count: number }[] | null)?.[0]?.count ?? 0,
  }));
}

export async function getProgrammeDetail(programmeId: string): Promise<ProgrammeDetail> {
  const { data, error } = await supabase
    .from('programme_blocks')
    .select('id, name, description, cover_image_url, goal_type, duration_weeks, scheduled_days, created_at')
    .eq('id', programmeId)
    .single();

  if (error) throw error;

  const { data: weeks, error: weeksError } = await supabase
    .from('programme_weeks')
    .select('id, week_number, workouts(count)')
    .eq('programme_id', programmeId)
    .order('week_number');

  if (weeksError) throw weeksError;

  return {
    id: data.id as string,
    name: data.name as string,
    description: data.description as string | null,
    coverImageUrl: data.cover_image_url as string | null,
    goalType: data.goal_type as GoalType,
    durationWeeks: data.duration_weeks as number,
    scheduledDays: (data.scheduled_days as ScheduledDay[] | null) ?? [],
    createdAt: data.created_at as string,
    weekCount: (weeks ?? []).length,
    weeks: (weeks ?? []).map((row) => ({
      id: row.id as string,
      weekNumber: row.week_number as number,
      workoutCount: (row.workouts as { count: number }[] | null)?.[0]?.count ?? 0,
    })),
  };
}

/** Adds one more week on top of however many the programme already has. */
export async function addProgrammeWeek(programmeId: string, weekNumber: number): Promise<string> {
  const { data, error } = await supabase
    .from('programme_weeks')
    .insert({ programme_id: programmeId, week_number: weekNumber })
    .select('id')
    .single();

  if (error) throw error;
  return data.id as string;
}

/** Renames a programme in place — used right after duplicating one, so
 * the coach can tell the copy apart from the original. */
export async function updateProgrammeName(programmeId: string, name: string) {
  const { error } = await supabase.from('programme_blocks').update({ name }).eq('id', programmeId);
  if (error) throw error;
}

type CopiedWeek = {
  weekId: string;
  weekNumber: number;
  /** New workout ids for this week's sessions, in the same order the
   * original sessions were created — needed by assignment to zip
   * sessions with calculated dates in a stable, predictable order. */
  workoutIds: string[];
};

/**
 * The one place that actually copies a programme: a new programme_blocks
 * row, its own new programme_weeks rows, and its own new workouts +
 * workout_exercises underneath each week — nothing in the copy
 * references a row from the original, so editing one can never touch
 * the other. Both "Duplicate" (making another template) and "Assign to
 * a client" (making a client's own instance) call this same function;
 * the only difference between them is what `overrides` says.
 *
 * Done as a straightforward sequence of reads and inserts rather than
 * one database transaction — there's no Postgres function for this yet,
 * so if a step partway through fails, the half-copied programme is
 * deleted; deleting the top-level row cascades down and cleans up
 * whatever weeks/workouts/exercises had already been copied under it.
 */
async function copyProgrammeStructure(
  coachId: string,
  programmeId: string,
  overrides: { name: string; clientId: string | null; startDate?: string | null }
): Promise<{ programmeId: string; weeks: CopiedWeek[] }> {
  const { data: source, error: sourceError } = await supabase
    .from('programme_blocks')
    .select('description, cover_image_url, goal_type, duration_weeks, scheduled_days')
    .eq('id', programmeId)
    .single();

  if (sourceError) throw sourceError;

  const { data: newProgramme, error: newProgrammeError } = await supabase
    .from('programme_blocks')
    .insert({
      coach_id: coachId,
      client_id: overrides.clientId,
      start_date: overrides.startDate ?? null,
      name: overrides.name,
      description: source.description,
      cover_image_url: source.cover_image_url,
      goal_type: source.goal_type,
      duration_weeks: source.duration_weeks,
      scheduled_days: source.scheduled_days,
    })
    .select('id')
    .single();

  if (newProgrammeError) throw newProgrammeError;

  const newProgrammeId = newProgramme.id as string;

  try {
    const { data: sourceWeeks, error: weeksError } = await supabase
      .from('programme_weeks')
      .select('id, week_number')
      .eq('programme_id', programmeId)
      .order('week_number');

    if (weeksError) throw weeksError;

    const copiedWeeks: CopiedWeek[] = [];

    for (const week of sourceWeeks ?? []) {
      const { data: newWeek, error: newWeekError } = await supabase
        .from('programme_weeks')
        .insert({ programme_id: newProgrammeId, week_number: week.week_number })
        .select('id')
        .single();

      if (newWeekError) throw newWeekError;
      const newWeekId = newWeek.id as string;

      const { data: sourceWorkouts, error: workoutsError } = await supabase
        .from('workouts')
        .select('id, name')
        .eq('programme_week_id', week.id)
        .order('created_at', { ascending: true });

      if (workoutsError) throw workoutsError;

      const workoutIds: string[] = [];

      for (const workout of sourceWorkouts ?? []) {
        const { data: newWorkout, error: newWorkoutError } = await supabase
          .from('workouts')
          .insert({ coach_id: coachId, name: workout.name, programme_week_id: newWeekId })
          .select('id')
          .single();

        if (newWorkoutError) throw newWorkoutError;
        workoutIds.push(newWorkout.id as string);

        const { data: sourceExercises, error: exercisesError } = await supabase
          .from('workout_exercises')
          .select('name, sets_reps, position')
          .eq('workout_id', workout.id)
          .order('position');

        if (exercisesError) throw exercisesError;

        if (sourceExercises && sourceExercises.length > 0) {
          const { error: newExercisesError } = await supabase.from('workout_exercises').insert(
            sourceExercises.map((exercise) => ({
              workout_id: newWorkout.id as string,
              name: exercise.name,
              sets_reps: exercise.sets_reps,
              position: exercise.position,
            }))
          );

          if (newExercisesError) throw newExercisesError;
        }
      }

      copiedWeeks.push({ weekId: newWeekId, weekNumber: week.week_number as number, workoutIds });
    }

    return { programmeId: newProgrammeId, weeks: copiedWeeks };
  } catch (err) {
    await supabase.from('programme_blocks').delete().eq('id', newProgrammeId);
    throw err;
  }
}

/** Makes another independent template, named "<original> (Copy)". See
 * `copyProgrammeStructure` for what "independent" actually guarantees. */
export async function duplicateProgramme(coachId: string, programmeId: string): Promise<string> {
  const { data: source, error: sourceError } = await supabase
    .from('programme_blocks')
    .select('name')
    .eq('id', programmeId)
    .single();

  if (sourceError) throw sourceError;

  const { programmeId: newProgrammeId } = await copyProgrammeStructure(coachId, programmeId, {
    name: `${source.name} (Copy)`,
    clientId: null,
  });

  return newProgrammeId;
}

function toISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

const WEEKDAY_INDEX: Record<ScheduledDay, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

/**
 * For one week of the programme (1-indexed), works out the actual
 * calendar date of each scheduled training day. Week 1 is the 7-day
 * span starting on startDate (whatever weekday that happens to be), not
 * a Monday-aligned calendar week — so a plan starting on a Thursday
 * still gets its Monday/Wednesday/Friday sessions in the right place
 * relative to day one. Returned in chronological order.
 */
function computeWeekSessionDates(startDate: Date, weekNumber: number, scheduledDays: ScheduledDay[]): Date[] {
  const weekStart = addDays(startDate, (weekNumber - 1) * 7);
  const weekStartWeekday = weekStart.getUTCDay();

  const dates = scheduledDays.map((day) => {
    const offset = (WEEKDAY_INDEX[day] - weekStartWeekday + 7) % 7;
    return addDays(weekStart, offset);
  });

  return dates.sort((a, b) => a.getTime() - b.getTime());
}

/**
 * Assigns a template to a client: duplicates it into a client-owned
 * instance (via the exact same copyProgrammeStructure used by
 * "Duplicate"), then creates one ordinary `assignments` row per
 * session, dated using the start date, that session's week number, and
 * the programme's scheduled training days.
 *
 * Those `assignments` rows are the only new thing any other feature
 * needs to know about — Up Next, the missed-workout auto-reschedule,
 * Momentum Score, and streaks all already read from `assignments`
 * without caring where a workout came from, so a programme-based
 * session shows up in all four automatically.
 *
 * Validates before writing anything: the template must have at least
 * one scheduled training day, and no week may hold more sessions than
 * there are training days to put them on (nowhere to legally place the
 * extra one). Either failure aborts with no rows written at all, rather
 * than guessing or partially assigning.
 */
export async function assignProgrammeToClient(
  coachId: string,
  clientId: string,
  templateId: string,
  startDate: string
): Promise<string> {
  const { data: template, error: templateError } = await supabase
    .from('programme_blocks')
    .select('name, scheduled_days')
    .eq('id', templateId)
    .single();

  if (templateError) throw templateError;

  const scheduledDays = (template.scheduled_days as ScheduledDay[] | null) ?? [];
  if (scheduledDays.length === 0) {
    throw new Error('This template has no training days set — add training days to it before assigning it.');
  }

  const { data: weeks, error: weeksError } = await supabase
    .from('programme_weeks')
    .select('week_number, workouts(count)')
    .eq('programme_id', templateId)
    .order('week_number');

  if (weeksError) throw weeksError;

  const overloadedWeek = (weeks ?? []).find(
    (week) => ((week.workouts as { count: number }[] | null)?.[0]?.count ?? 0) > scheduledDays.length
  );

  if (overloadedWeek) {
    const sessionCount = (overloadedWeek.workouts as { count: number }[] | null)?.[0]?.count ?? 0;
    throw new Error(
      `Week ${overloadedWeek.week_number} has ${sessionCount} sessions, but this programme only trains ` +
        `${scheduledDays.length} day${scheduledDays.length === 1 ? '' : 's'} a week. Reduce sessions in that ` +
        `week or add another training day before assigning.`
    );
  }

  const { programmeId: newProgrammeId, weeks: copiedWeeks } = await copyProgrammeStructure(coachId, templateId, {
    name: template.name as string,
    clientId,
    startDate,
  });

  try {
    const start = new Date(`${startDate}T00:00:00.000Z`);

    const assignmentRows = copiedWeeks.flatMap((week) => {
      const dates = computeWeekSessionDates(start, week.weekNumber, scheduledDays);
      return week.workoutIds.map((workoutId, index) => ({
        coach_id: coachId,
        client_id: clientId,
        workout_id: workoutId,
        assigned_date: toISODate(dates[index]),
      }));
    });

    if (assignmentRows.length > 0) {
      const { error: assignmentsError } = await supabase.from('assignments').insert(assignmentRows);
      if (assignmentsError) throw assignmentsError;
    }
  } catch (err) {
    await supabase.from('programme_blocks').delete().eq('id', newProgrammeId);
    throw err;
  }

  return newProgrammeId;
}

/** Lets the workout builder show "Week 2 of Push/Pull/Legs" instead of
 * just a bare id when it's creating a session inside a programme week. */
export async function getProgrammeWeekContext(weekId: string): Promise<ProgrammeWeekContext> {
  const { data, error } = await supabase
    .from('programme_weeks')
    .select('week_number, programme_id, programme_blocks(name)')
    .eq('id', weekId)
    .single();

  if (error) throw error;

  return {
    programmeId: data.programme_id as string,
    programmeName: (data.programme_blocks as unknown as { name: string } | null)?.name ?? 'Unknown programme',
    weekNumber: data.week_number as number,
  };
}

export type ClientProgrammeDay = {
  date: string;
  completed: boolean;
};

export type ClientProgrammeView = {
  id: string;
  name: string;
  description: string | null;
  coverImageUrl: string | null;
  goalType: GoalType;
  durationWeeks: number;
  startDate: string;
  hasStarted: boolean;
  currentWeekNumber: number;
  weekProgress: ClientProgrammeDay[];
  sessionsCompletedThisWeek: number;
  sessionsScheduledThisWeek: number;
  mostRecentCompleted: { workoutName: string; date: string } | null;
  nextUpcoming: { assignmentId: string; workoutName: string; date: string } | null;
};

/**
 * Everything the client's Training tab needs for the "Your Programme"
 * card, built entirely from tables that already exist for other
 * reasons: programme_blocks/programme_weeks for the framing (name, week
 * count, start date), and `assignments` — the exact same table Up Next,
 * the reschedule check, Momentum Score, and streaks all already read —
 * for which sessions are scheduled, completed, or next. Nothing here is
 * a second source of truth for "what's scheduled and when"; it's a
 * different view onto the same rows.
 *
 * If the client has more than one assigned programme (e.g. a past one
 * plus a current one), the one with the most recent start date wins.
 * Rows with no start date at all are excluded outright rather than left
 * to the sort — Postgres treats NULL as "greater than everything" in a
 * descending sort by default, so without this a stale, never-really-
 * started instance would silently outrank a real one instead of losing
 * to it. Returns null if nothing valid has been assigned yet.
 */
export async function getClientProgramme(clientId: string): Promise<ClientProgrammeView | null> {
  const { data: programme, error: programmeError } = await supabase
    .from('programme_blocks')
    .select('id, name, description, cover_image_url, goal_type, duration_weeks, start_date')
    .eq('client_id', clientId)
    .not('start_date', 'is', null)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (programmeError) throw programmeError;
  if (!programme || !programme.start_date) return null;

  const { data: weeks, error: weeksError } = await supabase
    .from('programme_weeks')
    .select('id, week_number')
    .eq('programme_id', programme.id)
    .order('week_number');

  if (weeksError) throw weeksError;

  const weekIds = new Set((weeks ?? []).map((week) => week.id as string));
  const maxWeekNumber = (weeks ?? []).reduce((max, week) => Math.max(max, week.week_number as number), 1);

  const startDate = new Date(`${programme.start_date}T00:00:00.000Z`);
  const today = new Date();
  const hasStarted = today.getTime() >= startDate.getTime();
  const daysElapsed = Math.floor((today.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
  const currentWeekNumber = Math.min(Math.max(daysElapsed + 1, 1), maxWeekNumber);

  // All of this client's assignments, filtered down to just the ones
  // whose workout belongs to a week of THIS programme — an assignment
  // from a standalone workout, or from a different programme, is left
  // out of this card (it still shows up in Up Next and the full
  // Training history exactly as before).
  const { data: assignmentRows, error: assignmentsError } = await supabase
    .from('assignments')
    .select('id, assigned_date, status, workouts(name, programme_week_id)')
    .eq('client_id', clientId)
    .order('assigned_date', { ascending: true });

  if (assignmentsError) throw assignmentsError;

  const programmeAssignments = (assignmentRows ?? [])
    .map((row) => {
      const workout = row.workouts as unknown as { name: string; programme_week_id: string | null } | null;
      return {
        id: row.id as string,
        assignedDate: row.assigned_date as string,
        status: row.status as 'pending' | 'completed',
        workoutName: workout?.name ?? 'Unknown workout',
        programmeWeekId: workout?.programme_week_id ?? null,
      };
    })
    .filter((row) => row.programmeWeekId !== null && weekIds.has(row.programmeWeekId));

  const weekStart = addDays(startDate, (currentWeekNumber - 1) * 7);
  const weekProgress: ClientProgrammeDay[] = Array.from({ length: 7 }, (_, index) => {
    const date = toISODate(addDays(weekStart, index));
    const completed = programmeAssignments.some((a) => a.assignedDate === date && a.status === 'completed');
    return { date, completed };
  });

  const weekDates = new Set(weekProgress.map((day) => day.date));
  const thisWeekSessions = programmeAssignments.filter((a) => weekDates.has(a.assignedDate));

  const completedDescending = programmeAssignments
    .filter((a) => a.status === 'completed')
    .sort((a, b) => (a.assignedDate < b.assignedDate ? 1 : -1));

  const pendingAscending = programmeAssignments
    .filter((a) => a.status === 'pending')
    .sort((a, b) => (a.assignedDate < b.assignedDate ? -1 : 1));

  return {
    id: programme.id as string,
    name: programme.name as string,
    description: programme.description as string | null,
    coverImageUrl: programme.cover_image_url as string | null,
    goalType: programme.goal_type as GoalType,
    durationWeeks: programme.duration_weeks as number,
    startDate: programme.start_date as string,
    hasStarted,
    currentWeekNumber,
    weekProgress,
    sessionsCompletedThisWeek: thisWeekSessions.filter((a) => a.status === 'completed').length,
    sessionsScheduledThisWeek: thisWeekSessions.length,
    mostRecentCompleted: completedDescending[0]
      ? { workoutName: completedDescending[0].workoutName, date: completedDescending[0].assignedDate }
      : null,
    nextUpcoming: pendingAscending[0]
      ? {
          assignmentId: pendingAscending[0].id,
          workoutName: pendingAscending[0].workoutName,
          date: pendingAscending[0].assignedDate,
        }
      : null,
  };
}
