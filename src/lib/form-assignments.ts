import { supabase } from '@/lib/supabase';
import { WEEKDAY_INDEX, type ScheduledDay } from '@/lib/programmes';
import { addDays } from '@/lib/time-ranges';

export type FormAssignmentDraft = {
  formId: string;
  clientId: string;
  recurrenceDay: ScheduledDay;
  dueWindowHours: number;
};

export type ClientFormAssignment = {
  id: string;
  formName: string;
  recurrenceDay: ScheduledDay;
  dueWindowHours: number;
  createdAt: string;
};

export async function createFormAssignment(coachId: string, draft: FormAssignmentDraft): Promise<string> {
  const { data, error } = await supabase
    .from('form_assignments')
    .insert({
      coach_id: coachId,
      client_id: draft.clientId,
      form_id: draft.formId,
      recurrence_day: draft.recurrenceDay,
      due_window_hours: draft.dueWindowHours,
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id as string;
}

/** Used by the Clients detail page's Check-in Schedule section — every
 * recurring form this client has assigned, regardless of which coach
 * created it (matches this app's existing "any coach sees any client"
 * shape everywhere else). */
export async function listClientFormAssignments(clientId: string): Promise<ClientFormAssignment[]> {
  const { data, error } = await supabase
    .from('form_assignments')
    .select('id, recurrence_day, due_window_hours, created_at, form_templates(name)')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    formName: (row.form_templates as unknown as { name: string } | null)?.name ?? 'Unknown form',
    recurrenceDay: row.recurrence_day as ScheduledDay,
    dueWindowHours: row.due_window_hours as number,
    createdAt: row.created_at as string,
  }));
}

export type UpcomingCheckIn = {
  /** The calendar date the check-in is scheduled for. */
  scheduledDate: string;
  /** scheduledDate at 00:00 UTC, plus dueWindowHours — the actual
   * moment a submission stops counting as "on time." */
  deadline: string;
};

/**
 * The next `count` occurrences of a weekly recurrence, walked forward
 * from `fromDateISO` (inclusive — if `fromDateISO` already falls on
 * `recurrenceDay`, that date is the first occurrence, not skipped).
 * Same weekday math `computeWeekSessionDates` in programmes.ts uses to
 * place a programme's sessions, just walked indefinitely rather than
 * confined to one programme's duration, since a check-in schedule has
 * no end date — this is exactly what "generates the right scheduled
 * dates going forward" means for this feature: nothing is pre-written
 * to the database, it's computed fresh from the rule every time it's
 * asked, from whatever date is passed in as "now."
 */
export function listUpcomingCheckInDates(
  recurrenceDay: ScheduledDay,
  dueWindowHours: number,
  fromDateISO: string,
  count: number
): UpcomingCheckIn[] {
  const targetWeekday = WEEKDAY_INDEX[recurrenceDay];
  const fromWeekday = new Date(`${fromDateISO}T00:00:00.000Z`).getUTCDay();
  const offsetToFirst = (targetWeekday - fromWeekday + 7) % 7;
  const firstDate = addDays(fromDateISO, offsetToFirst);

  return Array.from({ length: count }, (_, index) => {
    const scheduledDate = addDays(firstDate, index * 7);
    const deadline = new Date(`${scheduledDate}T00:00:00.000Z`);
    deadline.setUTCHours(deadline.getUTCHours() + dueWindowHours);
    return { scheduledDate, deadline: deadline.toISOString() };
  });
}
