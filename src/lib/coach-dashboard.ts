import { activityLabel, type ActivityType } from '@/lib/activity-logs';
import { getComplianceScore } from '@/lib/compliance';
import { listClients } from '@/lib/clients';
import { getOpenReports } from '@/lib/community';
import { getMomentumScore } from '@/lib/momentum';
import { getSessionScorecard } from '@/lib/session-scorecard';
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
  | { kind: 'workout'; at: string; clientName: string; workoutName: string }
  | { kind: 'activity'; at: string; clientName: string; activityLabel: string; durationMinutes: number };

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
  const [foodResult, logsResult, activityResult] = await Promise.all([
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
    supabase
      .from('activity_logs')
      .select('activity_type, custom_label, duration_minutes, created_at, profiles!client_id(full_name, email)')
      .order('created_at', { ascending: false })
      .limit(limit),
  ]);

  if (foodResult.error) throw foodResult.error;
  if (logsResult.error) throw logsResult.error;
  if (activityResult.error) throw activityResult.error;

  const mealEvents: ActivityEvent[] = (foodResult.data ?? []).map((row) => ({
    kind: 'meal',
    at: row.created_at as string,
    clientName: displayName(row.profiles as unknown as ProfileEmbed),
    meal: row.meal as string,
    calories: row.calories as number,
  }));

  const activityEvents: ActivityEvent[] = (activityResult.data ?? []).map((row) => ({
    kind: 'activity',
    at: row.created_at as string,
    clientName: displayName(row.profiles as unknown as ProfileEmbed),
    activityLabel: activityLabel(row.activity_type as ActivityType, row.custom_label as string | null),
    durationMinutes: row.duration_minutes as number,
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

  return [...mealEvents, ...workoutEvents, ...activityEvents].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

export type ClientActivityEvent = (
  | { kind: 'meal'; meal: string; calories: number; protein: number | null }
  | { kind: 'habit'; habitName: string }
  | { kind: 'workout'; workoutName: string; totalWeightLifted: number; durationMinutes: number | null; sessionRpe: number | null }
  | {
      kind: 'activity';
      activityLabel: string;
      durationMinutes: number;
      distance: number | null;
      distanceUnit: 'km' | 'mi' | null;
      calories: number | null;
    }
) & {
  at: string;
  clientId: string;
  clientName: string;
  /** This client's CURRENT live Momentum/Compliance Score, not a
   * snapshot from when the event happened -- computed once per distinct
   * client on this page (see below), same real calculations the rest of
   * the app already uses (momentum.ts / compliance.ts). Null only if
   * that calculation itself failed for this client, not "no data yet"
   * (both already return a real 0-ish number for a brand-new client). */
  momentumScore: number | null;
  complianceScore: number | null;
};

/**
 * The coach's full, cross-client activity feed — every logged meal,
 * completed habit, and completed workout, across every client, most
 * recent first. Unlike getRecentClientActivity() above (the small
 * preview embedded on the dashboard), this also includes habits (see
 * client-activity-feed.sql for the RLS policy that makes that
 * possible) and attaches each event's client's live Momentum/Compliance
 * Score. Pair with subscribeToClientActivity() below for real-time
 * delivery of new events.
 */
export async function getClientActivityFeed(limit = 30): Promise<ClientActivityEvent[]> {
  const [foodResult, habitResult, logsResult, activityResult] = await Promise.all([
    supabase
      .from('food_logs')
      .select('client_id, meal, calories, protein, created_at, profiles!client_id(full_name, email)')
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('habit_logs')
      .select('client_id, created_at, habits(name), profiles!client_id(full_name, email)')
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('workout_logs')
      .select('assignment_id, created_at, assignments(client_id, status, workouts(name), profiles!client_id(full_name, email))')
      .order('created_at', { ascending: false })
      .limit(limit * 10),
    supabase
      .from('activity_logs')
      .select('client_id, activity_type, custom_label, duration_minutes, distance, distance_unit, calories, created_at, profiles!client_id(full_name, email)')
      .order('created_at', { ascending: false })
      .limit(limit),
  ]);

  if (foodResult.error) throw foodResult.error;
  if (habitResult.error) throw habitResult.error;
  if (logsResult.error) throw logsResult.error;
  if (activityResult.error) throw activityResult.error;

  const mealEvents: ClientActivityEvent[] = (foodResult.data ?? []).map((row) => ({
    kind: 'meal',
    at: row.created_at as string,
    clientId: row.client_id as string,
    clientName: displayName(row.profiles as unknown as ProfileEmbed),
    meal: row.meal as string,
    calories: row.calories as number,
    protein: row.protein as number | null,
    momentumScore: null,
    complianceScore: null,
  }));

  const habitEvents: ClientActivityEvent[] = (habitResult.data ?? []).map((row) => {
    const habit = row.habits as unknown as { name: string } | null;
    return {
      kind: 'habit',
      at: row.created_at as string,
      clientId: row.client_id as string,
      clientName: displayName(row.profiles as unknown as ProfileEmbed),
      habitName: habit?.name ?? 'a habit',
      momentumScore: null,
      complianceScore: null,
    };
  });

  const activityEvents: ClientActivityEvent[] = (activityResult.data ?? []).map((row) => ({
    kind: 'activity',
    at: row.created_at as string,
    clientId: row.client_id as string,
    clientName: displayName(row.profiles as unknown as ProfileEmbed),
    activityLabel: activityLabel(row.activity_type as ActivityType, row.custom_label as string | null),
    durationMinutes: row.duration_minutes as number,
    distance: row.distance as number | null,
    distanceUnit: row.distance_unit as 'km' | 'mi' | null,
    calories: row.calories as number | null,
    momentumScore: null,
    complianceScore: null,
  }));

  // Same dedupe-by-assignment approach as getRecentClientActivity above
  // (workout_logs has one row per SET, not per completed workout) --
  // sorted and capped BEFORE fetching a scorecard for each, since a
  // scorecard is a real, non-trivial query and there's no point computing
  // one for a completed workout that wouldn't even make the final list.
  const seenAssignments = new Set<string>();
  const completedAssignments: { assignmentId: string; at: string; clientId: string; clientName: string; workoutName: string }[] = [];
  for (const row of logsResult.data ?? []) {
    const assignmentId = row.assignment_id as string;
    if (seenAssignments.has(assignmentId)) continue;
    seenAssignments.add(assignmentId);

    const assignment = row.assignments as unknown as {
      client_id: string;
      status: string;
      workouts: { name: string } | null;
      profiles: ProfileEmbed;
    } | null;
    if (!assignment || assignment.status !== 'completed') continue;

    completedAssignments.push({
      assignmentId,
      at: row.created_at as string,
      clientId: assignment.client_id,
      clientName: displayName(assignment.profiles),
      workoutName: assignment.workouts?.name ?? 'a workout',
    });
  }
  completedAssignments.sort((a, b) => b.at.localeCompare(a.at));

  const workoutEvents: ClientActivityEvent[] = await Promise.all(
    completedAssignments.slice(0, limit).map(async (entry) => {
      const scorecard = await getSessionScorecard(entry.assignmentId, entry.clientId).catch(() => null);
      return {
        kind: 'workout',
        at: entry.at,
        clientId: entry.clientId,
        clientName: entry.clientName,
        workoutName: entry.workoutName,
        totalWeightLifted: scorecard?.totalWeightLifted ?? 0,
        durationMinutes: scorecard?.durationMinutes ?? null,
        sessionRpe: scorecard?.sessionRpe ?? null,
        momentumScore: null,
        complianceScore: null,
      };
    })
  );

  const merged = [...mealEvents, ...habitEvents, ...workoutEvents, ...activityEvents]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);

  // Momentum/Compliance computed once per distinct client on this page,
  // not once per event -- several events from the same client would
  // otherwise repeat the exact same non-trivial query set for an
  // identical answer.
  const clientIds = [...new Set(merged.map((event) => event.clientId))];
  const scoresByClient = new Map<string, { momentumScore: number | null; complianceScore: number | null }>();
  await Promise.all(
    clientIds.map(async (clientId) => {
      const [momentum, compliance] = await Promise.all([
        getMomentumScore(clientId).catch(() => null),
        getComplianceScore(clientId).catch(() => null),
      ]);
      scoresByClient.set(clientId, {
        momentumScore: momentum ? Math.round(momentum.score * 10) / 10 : null,
        complianceScore: compliance?.score ?? null,
      });
    })
  );

  return merged.map((event) => ({ ...event, ...(scoresByClient.get(event.clientId) ?? {}) }));
}

/**
 * Live delivery for the feed above — three realtime subscriptions (new
 * meals, new completed habits, and assignments flipping to completed;
 * see client-activity-feed.sql for the migration that makes all three
 * actually broadcast), each just re-triggering a full refetch rather
 * than trying to reconstruct one event from a partial realtime payload
 * (the same "any change -> refetch" approach chat.ts's
 * subscribeToConversation already uses). Returns an unsubscribe
 * function — call it on unmount, same contract as subscribeToConversation.
 */
export function subscribeToClientActivity(onChange: () => void): () => void {
  const channel = supabase
    .channel('client-activity-feed')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'food_logs' }, onChange)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'habit_logs' }, onChange)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_logs' }, onChange)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'assignments', filter: 'status=eq.completed' }, onChange)
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
