import { getExternalFormDetail, type ExternalFormDetail } from '@/lib/external-forms';
import { supabase } from '@/lib/supabase';

export type OnboardingStatus = 'needs_parq' | 'needs_health_review' | 'complete';

/**
 * Not a tracked "current step" pointer — those drift out of sync with
 * reality. This looks at what's actually true about the account each
 * time: no PARQ answers on file yet means PARQ is still owed; flagged
 * and not yet acknowledged means the health advisory is still owed;
 * otherwise onboarding is done. A client who abandons partway through
 * just resumes exactly here on their next login, with nothing separate
 * to keep in sync.
 */
export async function getOnboardingStatus(clientId: string): Promise<OnboardingStatus> {
  const [responseResult, profileResult] = await Promise.all([
    supabase.from('onboarding_parq_responses').select('id').eq('client_id', clientId).limit(1),
    supabase.from('profiles').select('onboarding_health_flagged, onboarding_health_acknowledged_at').eq('id', clientId).single(),
  ]);

  if (responseResult.error) throw responseResult.error;
  if (profileResult.error) throw profileResult.error;

  if ((responseResult.data ?? []).length === 0) return 'needs_parq';

  const flagged = profileResult.data.onboarding_health_flagged as boolean;
  const acknowledgedAt = profileResult.data.onboarding_health_acknowledged_at as string | null;
  if (flagged && !acknowledgedAt) return 'needs_health_review';

  return 'complete';
}

/** Whichever form app_settings.parq_form_id currently points at — see
 * onboarding.sql for how that gets set (and the RLS fix that lets an
 * authenticated client actually read it, unlike the anonymous External
 * Builder path). Null only if nothing has ever been configured, which
 * shouldn't happen once the migration has run once. */
export async function getParqForm(): Promise<ExternalFormDetail | null> {
  const { data, error } = await supabase.from('app_settings').select('parq_form_id').eq('id', true).single();
  if (error) throw error;

  const formId = data.parq_form_id as string | null;
  if (!formId) return null;

  return getExternalFormDetail(formId);
}

/** Upsert, not insert — safe to retry if a submission partially failed
 * (see onboarding.sql's matching update policy and trigger). The
 * health-flag evaluation itself runs as a database trigger on this
 * table, not here — see flag_onboarding_health_risk in onboarding.sql. */
export async function submitOnboardingParq(clientId: string, answers: { questionId: string; answer: unknown }[]): Promise<void> {
  const rows = answers.map((a) => ({ client_id: clientId, question_id: a.questionId, answer: a.answer }));
  const { error } = await supabase.from('onboarding_parq_responses').upsert(rows, { onConflict: 'client_id,question_id' });
  if (error) throw error;
}

/** Either resolution path — a bare acknowledgment, or one with a
 * clearance note — writes the exact same timestamp; there's no separate
 * mechanism for the two, since the actual effect (the account is no
 * longer held) is identical either way. */
export async function acknowledgeHealthAdvisory(clientId: string, note: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ onboarding_health_acknowledged_at: new Date().toISOString(), onboarding_clearance_note: note.trim() || null })
    .eq('id', clientId);

  if (error) throw error;
}

/**
 * Auto-completes onboarding with zero coach involvement: places the
 * client on the Base Plan (Tier 1, stored as 'club') and applies the
 * exact "Base Plan defaults" toggle preset a coach would otherwise have
 * set by hand. Safe to call every time onboarding status resolves to
 * 'complete' — see complete_client_onboarding() in
 * onboarding-auto-provision.sql, which only ever actually provisions
 * once, ever, per client, and is a no-op on every call after that (so
 * it can never silently undo a coach's later manual tier/toggle
 * change). Called from the two real completion points (finishing PARQ
 * clean, and acknowledging the health advisory) and, as a safety net
 * for a client whose provisioning didn't get to run the first time
 * (e.g. a dropped connection), from every later onboarding-status
 * check that finds 'complete' too.
 */
export async function ensureClientProvisioned(): Promise<void> {
  const { error } = await supabase.rpc('complete_client_onboarding');
  if (error) throw error;
}
