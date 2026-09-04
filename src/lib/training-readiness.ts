import { supabase } from '@/lib/supabase';

// How many of the client's most recent readiness check-ins feed the
// wellness side of the score -- enough to smooth out one rough night
// or one unusually sore day, without blurring into a stale trend from
// weeks ago. Recency-weighted (see buildWellnessComponent) so the most
// recent one still counts the most.
const RECENT_READINESS_SESSIONS = 5;

// Training-load side: how many completed workouts in the trailing week
// counts as "about as much as anyone reasonably trains" -- the point
// past which this heuristic treats them as fully fatigued rather than
// requiring an unrealistic higher number. Real fatigue science is far
// more nuanced than a session count; this is a deliberately simple,
// transparent proxy, not a physiological model.
const MAX_WEEKLY_WORKOUTS_FOR_FATIGUE = 6;
const TRAINING_LOAD_WINDOW_DAYS = 7;

// Equal weight: the client's own reported wellness and their recent
// training load both matter, and neither should quietly dominate.
const WELLNESS_WEIGHT = 0.5;

// A coach-authored question with any of these words in its label reads
// backwards from every other scale question here -- a HIGH stress or
// soreness rating means LOW readiness, unlike sleep/energy/motivation
// questions where high means good. Heuristic, not perfect: an unusually
// worded question (e.g. "rate your lack of motivation") could still
// fool it, but it correctly handles the seeded default form
// (sleep/soreness/energy/stress) and any similarly-phrased one.
const LOWER_IS_BETTER_KEYWORDS = ['stress', 'sore', 'fatigue', 'pain', 'tired'];

function isLowerIsBetter(label: string): boolean {
  const lower = label.toLowerCase();
  return LOWER_IS_BETTER_KEYWORDS.some((word) => lower.includes(word));
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export type TrainingReadinessBreakdown = {
  /** 1-10, same scale/rounding convention as Momentum Score. */
  score: number;
  /** 0-1, recency-weighted average of the client's own recent
   * readiness check-in ratings (higher = better reported wellness). */
  wellnessComponent: number;
  /** 0-1, how fresh recent training load leaves them (1 = little
   * recent training, 0 = at or past MAX_WEEKLY_WORKOUTS_FOR_FATIGUE
   * completed sessions in the trailing week). */
  trainingLoadComponent: number;
  /** How many completed workouts fed trainingLoadComponent, shown so
   * the number is never a mystery. */
  recentWorkoutCount: number;
  /** How many past readiness check-ins fed wellnessComponent. */
  sessionsUsed: number;
};

/**
 * A real leading indicator of "how ready is this client to train right
 * now" -- blends two things, neither fabricated:
 *
 *  1. Their own recent readiness check-in ratings (the existing
 *     pre-workout questionnaire, scale-type questions only -- a coach
 *     can otherwise customize this form freely). Recency-weighted
 *     across the last RECENT_READINESS_SESSIONS check-ins rather than
 *     just the single most recent one, so one rough night doesn't
 *     swing the score alone, but a real multi-day trend still shows.
 *
 *  2. How much they've actually trained in the last
 *     TRAINING_LOAD_WINDOW_DAYS -- more completed sessions recently
 *     means less recovery time banked, same direction real fatigue
 *     works, without requiring any wearable or HRV data this app
 *     doesn't have.
 *
 * Returns null only when the client has never once answered a
 * readiness check-in -- there's nothing real to build a wellness signal
 * from yet, and a score built from training load alone (which is
 * always computable, even as "fully fresh" for a brand new client)
 * would imply more insight into how they're actually feeling than this
 * app really has.
 */
export async function getTrainingReadiness(clientId: string): Promise<TrainingReadinessBreakdown | null> {
  // More than enough rows to cover RECENT_READINESS_SESSIONS worth of
  // questions even for a long custom form -- grouped into sessions
  // below rather than filtered here, since a readiness submission
  // writes one row per question, not one row per session.
  const { data: responseRows, error: responseError } = await supabase
    .from('readiness_responses')
    .select('assignment_id, answer, created_at, form_questions(question_type, label, config)')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(40);

  if (responseError) throw responseError;
  if (!responseRows || responseRows.length === 0) return null;

  const { wellnessComponent, sessionsUsed } = buildWellnessComponent(responseRows);
  if (sessionsUsed === 0) return null;

  const today = todayISODate();
  const windowStart = addDays(today, -(TRAINING_LOAD_WINDOW_DAYS - 1));

  const { data: recentWorkouts, error: workoutsError } = await supabase
    .from('assignments')
    .select('id')
    .eq('client_id', clientId)
    .eq('status', 'completed')
    .gte('assigned_date', windowStart)
    .lte('assigned_date', today);

  if (workoutsError) throw workoutsError;

  const recentWorkoutCount = recentWorkouts?.length ?? 0;
  const trainingLoadComponent = Math.max(0, 1 - recentWorkoutCount / MAX_WEEKLY_WORKOUTS_FOR_FATIGUE);

  const average = WELLNESS_WEIGHT * wellnessComponent + (1 - WELLNESS_WEIGHT) * trainingLoadComponent;
  const score = 1 + 9 * average;

  return { score, wellnessComponent, trainingLoadComponent, recentWorkoutCount, sessionsUsed };
}

type ResponseRow = {
  assignment_id: unknown;
  answer: unknown;
  created_at: unknown;
  form_questions: unknown;
};

/**
 * Groups the raw per-question rows back into sessions (one readiness
 * submission = several rows sharing an assignment_id), scores each
 * session as the average of its own scale-type answers (normalized to
 * 0-1 by that question's own min/max, flipped for a lower-is-better
 * question), then averages across sessions with linearly decreasing
 * weight by recency -- the most recent of the RECENT_READINESS_SESSIONS
 * counts the most, the oldest counts the least.
 */
function buildWellnessComponent(rows: ResponseRow[]): { wellnessComponent: number; sessionsUsed: number } {
  const sessionOrder: string[] = [];
  const sessionScores = new Map<string, number[]>();

  for (const row of rows) {
    const assignmentId = row.assignment_id as string;
    const question = row.form_questions as { question_type: string; label: string; config: unknown } | null;
    if (!question || question.question_type !== 'scale') continue;

    const config = question.config as { min: number; max: number };
    const answer = row.answer as number;
    if (typeof answer !== 'number' || config.max === config.min) continue;

    if (!sessionScores.has(assignmentId)) {
      // Rows are ordered most-recent-first, so once we've already seen
      // RECENT_READINESS_SESSIONS distinct sessions, a row belonging to
      // any NEW (older) session is out of the window -- but a row for a
      // session already in the window still counts, however far down
      // the row list it appears.
      if (sessionOrder.length >= RECENT_READINESS_SESSIONS) continue;
      sessionOrder.push(assignmentId);
      sessionScores.set(assignmentId, []);
    }

    let normalized = (answer - config.min) / (config.max - config.min);
    normalized = Math.max(0, Math.min(1, normalized));
    if (isLowerIsBetter(question.label)) normalized = 1 - normalized;
    sessionScores.get(assignmentId)!.push(normalized);
  }

  if (sessionOrder.length === 0) return { wellnessComponent: 0, sessionsUsed: 0 };

  // Most recent session weighted highest, oldest weighted lowest --
  // sessionOrder is already in recency order (rows were fetched newest
  // first), so the first entry is the most recent.
  let weightedSum = 0;
  let totalWeight = 0;
  sessionOrder.forEach((assignmentId, index) => {
    const values = sessionScores.get(assignmentId)!;
    const sessionAverage = values.reduce((sum, v) => sum + v, 0) / values.length;
    const weight = sessionOrder.length - index;
    weightedSum += sessionAverage * weight;
    totalWeight += weight;
  });

  return { wellnessComponent: weightedSum / totalWeight, sessionsUsed: sessionOrder.length };
}
