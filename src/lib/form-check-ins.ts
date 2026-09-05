import { saveBodyMeasurement, type MeasurementType } from '@/lib/body-measurements';
import { listUpcomingCheckInDates } from '@/lib/form-assignments';
import type { ScheduledDay } from '@/lib/programmes';
import type { QuestionConfig, QuestionType } from '@/lib/question-types';
import { supabase } from '@/lib/supabase';
import { addDays } from '@/lib/time-ranges';
import { saveWeightLog } from '@/lib/weight-logs';

/** A check-in becomes visible (in Up Next and on the Calendar) starting
 * this many days before it's due — not the instant it's assigned, and
 * not only once it's actually due. */
const VISIBILITY_LEAD_DAYS = 2;

/** Still 'pending' this many days past its scheduled date and it's
 * auto-archived as 'missed' — never deleted, since Compliance Score /
 * On Time-Late tracking (next chunk) reads this history. */
const MISSED_AFTER_DAYS = 7;

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

/** Postgres's timestamptz JSON serialization is ISO-8601 but not
 * necessarily byte-identical to what `new Date().toISOString()`
 * produces (offset notation can differ) — round-tripping through
 * `Date` normalizes it before taking the date portion. */
function toISODateFromTimestamp(timestamp: string) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

type NewCheckInRow = {
  form_assignment_id: string;
  coach_id: string;
  client_id: string;
  form_id: string;
  scheduled_date: string;
  due_at: string;
};

/**
 * Lazily materializes any occurrence that should exist by now for each
 * of this client's active recurring assignments, then archives any
 * that have gone unanswered too long. Same "on app open" shape as the
 * missed-workout auto-reschedule and the weekly TDEE recalculation
 * check already in client/index.tsx: no server cron, no background
 * job to build or monitor — this just runs the moment the client's
 * Home tab loads, and is cheap enough (a handful of weekly rows) not
 * to matter if it runs on every visit.
 *
 * Reuses listUpcomingCheckInDates() (the same function the assign
 * screen's live preview calls) for the actual date math, rather than a
 * second implementation of "which day is the Nth occurrence" — the
 * only new logic here is *how many* occurrences to ask for (enough to
 * reach today + VISIBILITY_LEAD_DAYS) and turning that list into
 * upserted rows.
 */
export async function ensureCheckInsUpToDate(clientId: string): Promise<void> {
  const { data: assignments, error } = await supabase
    .from('form_assignments')
    .select('id, coach_id, form_id, recurrence_day, due_window_hours, created_at')
    .eq('client_id', clientId)
    .eq('archived', false);

  if (error) throw error;

  const today = todayISODate();
  const horizon = addDays(today, VISIBILITY_LEAD_DAYS);
  const rows: NewCheckInRow[] = [];

  for (const assignment of assignments ?? []) {
    const recurrenceDay = assignment.recurrence_day as ScheduledDay;
    const dueWindowHours = assignment.due_window_hours as number;
    const createdDate = toISODateFromTimestamp(assignment.created_at as string);

    const weeksToCover =
      Math.ceil(
        (new Date(`${horizon}T00:00:00.000Z`).getTime() - new Date(`${createdDate}T00:00:00.000Z`).getTime()) /
          (7 * 24 * 60 * 60 * 1000)
      ) + 1;

    const occurrences = listUpcomingCheckInDates(recurrenceDay, dueWindowHours, createdDate, Math.max(1, weeksToCover));

    for (const occurrence of occurrences) {
      if (occurrence.scheduledDate > horizon) break;
      rows.push({
        form_assignment_id: assignment.id as string,
        coach_id: assignment.coach_id as string,
        client_id: clientId,
        form_id: assignment.form_id as string,
        scheduled_date: occurrence.scheduledDate,
        due_at: occurrence.deadline,
      });
    }
  }

  if (rows.length > 0) {
    const { error: upsertError } = await supabase
      .from('form_check_ins')
      .upsert(rows, { onConflict: 'form_assignment_id,scheduled_date', ignoreDuplicates: true });
    if (upsertError) throw upsertError;
  }

  const missedCutoff = addDays(today, -MISSED_AFTER_DAYS);
  const { error: archiveError } = await supabase
    .from('form_check_ins')
    .update({ status: 'missed', archived: true })
    .eq('client_id', clientId)
    .eq('status', 'pending')
    .lt('scheduled_date', missedCutoff);

  if (archiveError) throw archiveError;
}

export type UpNextCheckIn = {
  id: string;
  formName: string;
  scheduledDate: string;
  dueAt: string;
};

/** Every currently-visible, not-yet-done check-in — Home's Up Next
 * section merges this with pending workout assignments into one list. */
export async function listUpNextCheckIns(clientId: string): Promise<UpNextCheckIn[]> {
  const { data, error } = await supabase
    .from('form_check_ins')
    .select('id, scheduled_date, due_at, form_templates(name)')
    .eq('client_id', clientId)
    .eq('status', 'pending')
    .eq('archived', false)
    .order('due_at', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    formName: (row.form_templates as unknown as { name: string } | null)?.name ?? 'Unknown form',
    scheduledDate: row.scheduled_date as string,
    dueAt: row.due_at as string,
  }));
}

export type CalendarCheckIn = {
  id: string;
  formName: string;
  scheduledDate: string;
  status: 'pending' | 'completed';
};

/** Every non-archived check-in, regardless of date — SessionCalendar
 * fetches once and slices by date client-side, same convention it
 * already uses for assignments/phases. Never includes 'missed' rows:
 * a missed check-in is archived the moment it's marked missed, so this
 * query (which filters archived=false) naturally never returns one —
 * consistent with "disappears from the client's active Calendar." */
export async function listVisibleCheckIns(clientId: string): Promise<CalendarCheckIn[]> {
  const { data, error } = await supabase
    .from('form_check_ins')
    .select('id, scheduled_date, status, form_templates(name)')
    .eq('client_id', clientId)
    .eq('archived', false)
    .order('scheduled_date', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    formName: (row.form_templates as unknown as { name: string } | null)?.name ?? 'Unknown form',
    scheduledDate: row.scheduled_date as string,
    status: row.status as 'pending' | 'completed',
  }));
}

export type CheckInQuestionAnswer = {
  id: string;
  position: number;
  questionType: QuestionType;
  label: string;
  config: QuestionConfig;
  /** null until answered — the fill-out screen renders an editable
   * input; the read-only view renders whatever's here. */
  answer: unknown | null;
};

export type CheckInDetail = {
  id: string;
  formName: string;
  status: 'pending' | 'completed' | 'missed';
  scheduledDate: string;
  dueAt: string;
  completedAt: string | null;
  /** Populated for both audiences this screen is shared by — the coach's
   * admin view uses it to show whose check-in this is (this screen has
   * no other way to tell, since it's reached generically off a check-in
   * id); the client's own view already knows it's their own, so it's
   * simply unused there. */
  clientFullName: string | null;
  clientEmail: string;
  questions: CheckInQuestionAnswer[];
};

export async function getCheckInDetail(checkInId: string): Promise<CheckInDetail> {
  const { data, error } = await supabase
    .from('form_check_ins')
    .select('id, form_id, status, scheduled_date, due_at, completed_at, form_templates(name), profiles!client_id(full_name, email)')
    .eq('id', checkInId)
    .single();

  if (error) throw error;

  const { data: questions, error: questionsError } = await supabase
    .from('form_questions')
    .select('id, position, question_type, label, config')
    .eq('form_id', data.form_id)
    .order('position');

  if (questionsError) throw questionsError;

  const { data: responses, error: responsesError } = await supabase
    .from('form_responses')
    .select('question_id, answer')
    .eq('form_check_in_id', checkInId);

  if (responsesError) throw responsesError;

  const answerByQuestion = new Map<string, unknown>();
  (responses ?? []).forEach((row) => answerByQuestion.set(row.question_id as string, row.answer));

  const clientProfile = data.profiles as unknown as { full_name: string | null; email: string } | null;

  return {
    id: data.id as string,
    formName: (data.form_templates as unknown as { name: string } | null)?.name ?? 'Unknown form',
    status: data.status as 'pending' | 'completed' | 'missed',
    scheduledDate: data.scheduled_date as string,
    dueAt: data.due_at as string,
    completedAt: data.completed_at as string | null,
    clientFullName: clientProfile?.full_name ?? null,
    clientEmail: clientProfile?.email ?? '',
    questions: (questions ?? []).map((row) => ({
      id: row.id as string,
      position: row.position as number,
      questionType: row.question_type as QuestionType,
      label: row.label as string,
      config: (row.config as QuestionConfig) ?? {},
      answer: answerByQuestion.get(row.id as string) ?? null,
    })),
  };
}

/** Interprets a measurement question's config.unit against the fixed
 * unit its canonical table actually stores (kg for weight_logs, inches
 * for body_measurements) and converts. Recognizes only the handful of
 * real-world synonyms a coach would plausibly type in that free-text
 * field ('lb'/'lbs' for weight, 'cm' for a body measurement) plus the
 * native unit itself or nothing typed at all (this app never shows a
 * unit label elsewhere for either, so blank has always meant exactly
 * this). Anything else returns null rather than guess -- the answer
 * still gets recorded on the check-in itself either way; it just isn't
 * synced anywhere else. */
function convertMeasurementForSync(tracks: string, unit: string, answer: unknown): number | null {
  if (typeof answer !== 'number' || !Number.isFinite(answer)) return null;
  const normalizedUnit = unit.trim().toLowerCase();

  if (tracks === 'weight') {
    if (normalizedUnit === '' || normalizedUnit === 'kg') return answer;
    if (normalizedUnit === 'lb' || normalizedUnit === 'lbs' || normalizedUnit === 'pound' || normalizedUnit === 'pounds') {
      return answer / 2.2046226218;
    }
    return null;
  }

  // Every other tracked target is a body_measurements type, stored in inches.
  if (normalizedUnit === '' || normalizedUnit === 'in' || normalizedUnit === 'inch' || normalizedUnit === 'inches') return answer;
  if (normalizedUnit === 'cm') return answer / 2.54;
  return null;
}

export type CheckInAnswerSubmission = {
  questionId: string;
  answer: unknown;
  questionType: QuestionType;
  config: QuestionConfig;
};

/**
 * Saves every question's answer, then flips the check-in to
 * 'completed' — same "log the details first, flip status once they're
 * safely saved" order logWorkout() already uses for assignments, so a
 * failed insert never leaves a check-in marked done with nothing
 * behind it.
 *
 * "One source of truth" for weight/measurement answers: any question
 * whose config.tracks names a real metric (set in the check-in builder,
 * see question-types.ts) also gets written straight into
 * weight_logs/body_measurements, dated to this check-in's
 * scheduledDate (the day the check-in was actually FOR, not necessarily
 * the moment it happened to be submitted). That's the same table the
 * client's own Metrics/Measure tabs, trend chart, and TDEE calculation
 * already read from — so this data shows up there too, not just sealed
 * inside this one check-in's answers. An untagged (default) measurement
 * question behaves exactly as before: recorded here and nowhere else.
 */
export async function submitCheckIn(
  checkInId: string,
  clientId: string,
  scheduledDate: string,
  answers: CheckInAnswerSubmission[]
) {
  const rows = answers.map((entry) => ({
    form_check_in_id: checkInId,
    client_id: clientId,
    question_id: entry.questionId,
    answer: entry.answer,
  }));

  const { error: responsesError } = await supabase.from('form_responses').insert(rows);
  if (responsesError) throw responsesError;

  const { error: statusError } = await supabase
    .from('form_check_ins')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', checkInId);

  if (statusError) throw statusError;

  for (const entry of answers) {
    if (entry.questionType !== 'measurement') continue;
    const tracks = typeof entry.config.tracks === 'string' ? entry.config.tracks : 'none';
    if (tracks === 'none') continue;

    const unit = typeof entry.config.unit === 'string' ? entry.config.unit : '';
    const value = convertMeasurementForSync(tracks, unit, entry.answer);
    if (value === null) continue;

    if (tracks === 'weight') {
      await saveWeightLog(clientId, scheduledDate, value);
    } else {
      await saveBodyMeasurement(clientId, scheduledDate, tracks as MeasurementType, value);
    }
  }
}

export type ClientCheckInInstance = {
  id: string;
  formName: string;
  scheduledDate: string;
  status: 'pending' | 'completed' | 'missed';
};

/** The coach's view of a client's currently-active check-in instances,
 * for the "remove a specific check-in instance" action on the Clients
 * page. Archived ones (already-missed, or already removed) are
 * excluded — same "disappears from active views" rule as everywhere
 * else, though the rows themselves still exist for compliance
 * tracking. */
export async function listClientCheckInInstances(clientId: string): Promise<ClientCheckInInstance[]> {
  const { data, error } = await supabase
    .from('form_check_ins')
    .select('id, scheduled_date, status, form_templates(name)')
    .eq('client_id', clientId)
    .eq('archived', false)
    .order('scheduled_date', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    formName: (row.form_templates as unknown as { name: string } | null)?.name ?? 'Unknown form',
    scheduledDate: row.scheduled_date as string,
    status: row.status as 'pending' | 'completed' | 'missed',
  }));
}

/**
 * "Remove a specific check-in instance," from the coach's screen.
 * Still pending (nothing submitted, not yet missed) → nothing worth
 * preserving, so it's a real delete. Already completed or already
 * missed → archived instead, never deleted, exactly the same rule
 * cancelling a schedule follows and for the same reason: Compliance
 * Score / On Time-Late tracking needs the record to keep existing.
 */
export async function archiveOrDeleteCheckIn(checkInId: string): Promise<'deleted' | 'archived'> {
  const { data, error } = await supabase.from('form_check_ins').select('status').eq('id', checkInId).single();
  if (error) throw error;

  if (data.status === 'pending') {
    const { error: deleteError } = await supabase.from('form_check_ins').delete().eq('id', checkInId);
    if (deleteError) throw deleteError;
    return 'deleted';
  }

  const { error: archiveError } = await supabase.from('form_check_ins').update({ archived: true }).eq('id', checkInId);
  if (archiveError) throw archiveError;
  return 'archived';
}

export type CoachCheckInSubmission = {
  id: string;
  clientId: string;
  clientName: string;
  formName: string;
  scheduledDate: string;
  completedAt: string;
};

/** Every completed check-in across every client, most recent first —
 * the coach's own review queue. No dedicated coach-facing check-ins
 * list existed before this chunk (only checkins/[id].tsx, a shared
 * detail view reached from a client's own page); this is the new
 * screen's own data source. */
export async function listCompletedCheckIns(limit = 30): Promise<CoachCheckInSubmission[]> {
  const { data, error } = await supabase
    .from('form_check_ins')
    .select('id, client_id, scheduled_date, completed_at, form_templates(name), profiles!client_id(full_name, email)')
    .eq('status', 'completed')
    .eq('archived', false)
    .order('completed_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((row) => {
    const form = row.form_templates as unknown as { name: string } | null;
    const client = row.profiles as unknown as { full_name: string | null; email: string } | null;
    return {
      id: row.id as string,
      clientId: row.client_id as string,
      clientName: client?.full_name || client?.email?.split('@')[0] || 'A client',
      formName: form?.name ?? 'Unknown form',
      scheduledDate: row.scheduled_date as string,
      completedAt: row.completed_at as string,
    };
  });
}

/** The coach's own checkins_last_viewed_at — how far back "new
 * completion" counts from. Same last-viewed-timestamp shape
 * community.ts's getCommunityLastViewedAt() already established. */
export async function getCheckinsLastViewedAt(coachId: string): Promise<string> {
  const { data, error } = await supabase.from('profiles').select('checkins_last_viewed_at').eq('id', coachId).single();
  if (error) throw error;
  return data.checkins_last_viewed_at as string;
}

/** Call the instant the coach's check-ins list actually becomes visible
 * — same "opening it and seeing what's there counts as reading it" rule
 * every other last-viewed marker in this app follows. */
export async function markCheckinsViewed(coachId: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ checkins_last_viewed_at: new Date().toISOString() })
    .eq('id', coachId);
  if (error) throw error;
}

/** Check-ins completed since the given timestamp — the Home dashboard's
 * "Check-ins" nav card badge count. */
export async function getNewCompletedCheckInCount(since: string): Promise<number> {
  const { count, error } = await supabase
    .from('form_check_ins')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'completed')
    .eq('archived', false)
    .gt('completed_at', since);

  if (error) throw error;
  return count ?? 0;
}

/** Fires on any change to a check-in (a new completion, most notably) —
 * same "subscribe while mounted, unsubscribe on cleanup" shape every
 * other realtime badge in this app already uses. */
export function subscribeToCoachCheckIns(onChange: () => void): () => void {
  const channel = supabase
    .channel(`coach-checkins:${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'form_check_ins' }, onChange)
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
