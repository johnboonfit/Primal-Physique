import { listUpcomingCheckInDates } from '@/lib/form-assignments';
import type { ScheduledDay } from '@/lib/programmes';
import type { QuestionConfig, QuestionType } from '@/lib/question-types';
import { supabase } from '@/lib/supabase';
import { addDays } from '@/lib/time-ranges';

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
  questions: CheckInQuestionAnswer[];
};

export async function getCheckInDetail(checkInId: string): Promise<CheckInDetail> {
  const { data, error } = await supabase
    .from('form_check_ins')
    .select('id, form_id, status, scheduled_date, due_at, completed_at, form_templates(name)')
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

  return {
    id: data.id as string,
    formName: (data.form_templates as unknown as { name: string } | null)?.name ?? 'Unknown form',
    status: data.status as 'pending' | 'completed' | 'missed',
    scheduledDate: data.scheduled_date as string,
    dueAt: data.due_at as string,
    completedAt: data.completed_at as string | null,
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

/** Saves every question's answer, then flips the check-in to
 * 'completed' — same "log the details first, flip status once they're
 * safely saved" order logWorkout() already uses for assignments, so a
 * failed insert never leaves a check-in marked done with nothing
 * behind it. */
export async function submitCheckIn(
  checkInId: string,
  clientId: string,
  answers: { questionId: string; answer: unknown }[]
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
