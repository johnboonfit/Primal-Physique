// Deploy via the Supabase dashboard: Edge Functions -> Create a new
// function -> name it "stripe-webhook" -> paste this file's contents ->
// Deploy -- IMPORTANT: this one specific function must be deployed
// with JWT verification turned OFF (in the dashboard: this function's
// settings -> "Enforce JWT Verification" -> off; via the CLI:
// `supabase functions deploy stripe-webhook --no-verify-jwt`). Stripe
// calls this endpoint directly, with no Supabase session at all --
// its identity check is the signature below, not a JWT.
//
// Two secrets to set yourself, under this function's own Edge Functions
// -> Secrets (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are already
// there automatically):
//
//   STRIPE_SECRET_KEY     = the same one create-checkout-session uses
//   STRIPE_WEBHOOK_SECRET = whsec_... -- from the Stripe Dashboard,
//                           Developers -> Webhooks -> (this endpoint) ->
//                           Signing secret, AFTER you've pointed a
//                           webhook endpoint at this function's URL and
//                           subscribed it to the checkout.session.completed
//                           event (that's the only event this handles --
//                           see the note near the bottom on what that
//                           deliberately leaves out).
//
// This is the only place a client's tier is actually upgraded as a
// result of a real payment -- it runs as the service-role key, the same
// way delete-client.ts does, since a client was never given permission
// to write their own client_tiers row (see community-leaderboards.sql).

import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@22.6.1';

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

  if (!stripeSecretKey || !webhookSecret) {
    return jsonResponse({ error: 'STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET are not both set for this function yet.' }, 500);
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return jsonResponse({ error: 'Missing stripe-signature header.' }, 400);
  }

  const stripe = new Stripe(stripeSecretKey);
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    // The async variant -- Deno's crypto API (unlike Node's) only
    // exposes an async interface, so the sync constructEvent() Stripe's
    // own docs usually show would fail here.
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('Stripe signature verification failed:', err);
    return jsonResponse({ error: 'Invalid signature.' }, 400);
  }

  // checkout.session.completed only -- this deliberately does not
  // handle a later cancellation, a failed renewal, or a plan CHANGE on
  // an already-active subscription (this app has never tracked a
  // stripe_customer_id per client before this chunk, so there's no
  // existing subscription to look up and modify -- every upgrade here
  // starts a brand-new one). If a client who already upgraded once
  // upgrades again to a different tier, they'll end up with two active
  // Stripe subscriptions; reconciling that is a manual step in the
  // Stripe dashboard for now, not something this function resolves on
  // its own.
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const requestId = session.client_reference_id;

    if (!requestId) {
      console.error('checkout.session.completed had no client_reference_id:', session.id);
      return jsonResponse({ received: true }, 200);
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: upgradeRequest, error: upgradeRequestError } = await admin
      .from('plan_upgrade_requests')
      .select('id, client_id, requested_tier, status')
      .eq('id', requestId)
      .single();

    if (upgradeRequestError || !upgradeRequest) {
      console.error('No matching plan_upgrade_requests row for', requestId, upgradeRequestError);
      return jsonResponse({ received: true }, 200);
    }

    if (upgradeRequest.status === 'pending') {
      const { error: tierError } = await admin
        .from('client_tiers')
        .upsert({ client_id: upgradeRequest.client_id, tier: upgradeRequest.requested_tier }, { onConflict: 'client_id' });

      if (tierError) {
        console.error('Failed to upgrade client_tiers for', upgradeRequest.client_id, tierError);
        return jsonResponse({ error: 'Failed to record the tier upgrade.' }, 500);
      }

      const { error: statusError } = await admin
        .from('plan_upgrade_requests')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', upgradeRequest.id as string);

      if (statusError) {
        console.error('Failed to mark the upgrade request completed:', statusError);
      }
    }
  }

  // Stripe only cares that this comes back fast and with a 2xx -- every
  // other event type this endpoint receives (Stripe sends whatever the
  // Dashboard's webhook endpoint is subscribed to) is intentionally
  // ignored rather than erroring, so this can't accidentally 500 the
  // one event type it does care about because Stripe sent something
  // unrelated.
  return jsonResponse({ received: true }, 200);
});
