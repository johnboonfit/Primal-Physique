import type { ClientTier } from '@/lib/leaderboard';
import { supabase } from '@/lib/supabase';

export const PLAN_UPGRADE_OPTIONS: { tier: ClientTier; label: string }[] = [
  { tier: 'club', label: 'Request New Plan (Base Members)' },
  { tier: 'accelerator', label: 'Accelerator Plan' },
  { tier: 'precision', label: 'Precision Plan' },
];

/**
 * Starts a real Stripe Checkout for the given tier: inserts this
 * client's own 'pending' row (client-side, under normal RLS -- see
 * plan-upgrades.sql), then hands that row's id to the
 * create-checkout-session Edge Function, which looks the request back
 * up itself (never trusts a tier passed straight from the client for
 * pricing) and returns a real Stripe-hosted checkout URL. Nothing about
 * the client's plan actually changes yet at this point -- that only
 * happens once stripe-webhook hears back that the payment succeeded.
 */
export async function startPlanUpgrade(clientId: string, tier: ClientTier): Promise<string> {
  const { data: request, error: insertError } = await supabase
    .from('plan_upgrade_requests')
    .insert({ client_id: clientId, requested_tier: tier, status: 'pending' })
    .select('id')
    .single();

  if (insertError) throw insertError;

  const { data, error } = await supabase.functions.invoke('create-checkout-session', {
    body: { requestId: request.id as string },
  });

  if (error) {
    // A non-2xx response lands here, not in `data` -- the function's own
    // JSON error body (e.g. "STRIPE_SECRET_KEY is not set for this
    // function yet") is only reachable via error.context, the raw
    // Response object, so unwrap that for a message worth showing
    // instead of supabase-js's generic "non-2xx status code" default.
    const context = (error as { context?: Response }).context;
    let message: string | undefined;
    if (context) {
      try {
        const body = (await context.clone().json()) as { error?: string };
        message = body?.error;
      } catch {
        // Body wasn't JSON -- fall through to the generic error below.
      }
    }
    throw message ? new Error(message) : error;
  }

  const url = (data as { url?: string } | null)?.url;
  if (!url) {
    throw new Error('Stripe did not return a checkout link.');
  }
  return url;
}
