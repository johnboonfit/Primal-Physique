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

export async function listProgrammes(coachId: string): Promise<ProgrammeSummary[]> {
  const { data, error } = await supabase
    .from('programme_blocks')
    .select(
      'id, name, description, cover_image_url, goal_type, duration_weeks, scheduled_days, created_at, programme_weeks(count)'
    )
    .eq('coach_id', coachId)
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
