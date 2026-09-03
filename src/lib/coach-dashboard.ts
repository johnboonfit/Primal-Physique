import { getComplianceScore } from '@/lib/compliance';
import { listClients } from '@/lib/clients';
import { getOpenReports } from '@/lib/community';
import { supabase } from '@/lib/supabase';

export type CoachDashboardStats = {
  /** Clients with status 'active' only -- a paused client is
   * deliberately excluded from this specific count (it's the one place
   * "Active" is a literal, displayed claim), but still appears
   * everywhere else (roster, messaging, assigning) exactly as before;
   * pausing never removes a client from the app, only from this number. */
  activeClients: number;
  /** Average Compliance Score across every client, same 0-28-day
   * calculation the Clients list already shows per client -- null only
   * when there are no clients yet (nothing to average). */
  avgCompliance: number | null;
  /** Check-ins still 'pending' and already past their due_at, excluding
   * ones already auto-archived as 'missed' -- those already have their
   * outcome recorded; this is specifically the ones a nudge could still
   * save. */
  overdueCheckIns: number;
  openReports: number;
};

export async function getCoachDashboardStats(): Promise<CoachDashboardStats> {
  const clients = await listClients();

  const [scores, overdueResult, openReports] = await Promise.all([
    Promise.all(
      clients.map((client) =>
        getComplianceScore(client.id)
          .then((result) => result.score)
          .catch(() => null)
      )
    ),
    supabase
      .from('form_check_ins')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .eq('archived', false)
      .lt('due_at', new Date().toISOString()),
    getOpenReports(),
  ]);

  if (overdueResult.error) throw overdueResult.error;

  const validScores = scores.filter((score): score is number => score !== null);
  const avgCompliance =
    validScores.length > 0 ? Math.round(validScores.reduce((sum, score) => sum + score, 0) / validScores.length) : null;

  return {
    activeClients: clients.filter((client) => client.status === 'active').length,
    avgCompliance,
    overdueCheckIns: overdueResult.count ?? 0,
    openReports: openReports.length,
  };
}

export type ClientAttention = {
  clientId: string;
  name: string;
  complianceScore: number;
};

/** Clients below the same 50% "needs attention" red threshold the
 * Clients list already color-codes (see that screen's complianceColor),
 * worst first -- so the coach sees who to check on without opening
 * every client one by one. Empty means nobody's currently below it. */
export async function getClientsNeedingAttention(limit = 5): Promise<ClientAttention[]> {
  const clients = await listClients();

  const scored = await Promise.all(
    clients.map((client) =>
      getComplianceScore(client.id)
        .then((result) => ({ clientId: client.id, name: client.fullName || client.email, complianceScore: result.score }))
        .catch(() => null)
    )
  );

  return scored
    .filter((entry): entry is ClientAttention => entry !== null && entry.complianceScore < 50)
    .sort((a, b) => a.complianceScore - b.complianceScore)
    .slice(0, limit);
}

export type ActivityEvent =
  | { kind: 'meal'; at: string; clientName: string; meal: string; calories: number }
  | { kind: 'workout'; at: string; clientName: string; workoutName: string };

type ProfileEmbed = { full_name: string | null; email: string } | null;

function displayName(profile: ProfileEmbed): string {
  return profile?.full_name || profile?.email?.split('@')[0] || 'A client';
}

/**
 * A merged, real activity feed across every client -- logged meals and
 * completed workout sessions, most recent first. Habit and weight-log
 * activity are deliberately left out: coaches don't have read access to
 * either table yet (no RLS policy grants it, unlike food_logs and
 * workout_logs), so including them here would either fail or silently
 * show nothing depending on the row -- a follow-up migration, not
 * something to paper over in this query.
 *
 * A completed workout has no completed_at column on assignments itself,
 * so "when" is approximated the same way the completion scorecard
 * already does: the timestamp of that session's most recently logged
 * set (workout_logs.created_at), taking the first (i.e. latest, since
 * the query is already sorted desc) row per assignment.
 */
export async function getRecentClientActivity(limit = 10): Promise<ActivityEvent[]> {
  const [foodResult, logsResult] = await Promise.all([
    supabase
      .from('food_logs')
      .select('meal, calories, created_at, profiles!client_id(full_name, email)')
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('workout_logs')
      .select('assignment_id, created_at, assignments(status, workouts(name), profiles!client_id(full_name, email))')
      .order('created_at', { ascending: false })
      .limit(limit * 10),
  ]);

  if (foodResult.error) throw foodResult.error;
  if (logsResult.error) throw logsResult.error;

  const mealEvents: ActivityEvent[] = (foodResult.data ?? []).map((row) => ({
    kind: 'meal',
    at: row.created_at as string,
    clientName: displayName(row.profiles as unknown as ProfileEmbed),
    meal: row.meal as string,
    calories: row.calories as number,
  }));

  const seenAssignments = new Set<string>();
  const workoutEvents: ActivityEvent[] = [];
  for (const row of logsResult.data ?? []) {
    const assignmentId = row.assignment_id as string;
    if (seenAssignments.has(assignmentId)) continue;
    seenAssignments.add(assignmentId);

    const assignment = row.assignments as unknown as {
      status: string;
      workouts: { name: string } | null;
      profiles: ProfileEmbed;
    } | null;
    if (!assignment || assignment.status !== 'completed') continue;

    workoutEvents.push({
      kind: 'workout',
      at: row.created_at as string,
      clientName: displayName(assignment.profiles),
      workoutName: assignment.workouts?.name ?? 'a workout',
    });
  }

  return [...mealEvents, ...workoutEvents].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
