// Deploy via the Supabase dashboard: Edge Functions -> Create a new
// function -> name it "create-checkout-session" -> paste this file's
// contents -> Deploy. SUPABASE_URL, SUPABASE_ANON_KEY, and
// SUPABASE_SERVICE_ROLE_KEY are already available to every Edge
// Function automatically -- the one thing you DO need to set yourself,
// under Edge Functions -> Secrets, is:
//
//   STRIPE_SECRET_KEY = sk_live_... (or sk_test_... while testing)
//
// Never put that key anywhere else -- not in this repo, not in the app,
// not in an env var Expo would bundle client-side. This function is the
// only place it's ever read.
//
// What this does: a client picks a plan tier in the app, which first
// inserts its own 'pending' row into plan_upgrade_requests (that insert
// happens client-side, under normal RLS -- see plan-upgrades.sql), then
// calls this function with just that row's id. This function looks the
// row back up itself (never trusts a tier the client might pass
// directly, in case of a tampered request) via the service-role key,
// maps its requested_tier to the matching Stripe Price, and asks Stripe
// for a Checkout Session. The actual tier change only ever happens once
// stripe-webhook hears back that payment succeeded -- this function
// never touches client_tiers itself.

import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@22.6.1';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// The three Price IDs the coach gave for this chunk. If a plan's real
// price ever changes in Stripe (a new Price object, not just editing
// the old one -- Stripe Prices are immutable), update the id here.
const PRICE_ID_BY_TIER: Record<string, string> = {
  club: 'price_1UCKhBIrI0JCZBzSZjpn6rMM',
  accelerator: 'price_1UCKebIrI0JCZBzSKkTz3fof',
  precision: 'price_1UCKfKIrI0JCZBzSXbeSaqJ6',
};

// Deep links back into the app itself (see app.json's "scheme") --
// WebBrowser.openAuthSessionAsync on the client closes itself the
// moment the in-app browser navigates to either of these, so there's
// no need for these URLs to resolve to anything real on the web.
const SUCCESS_URL = 'primalphysique://settings?upgrade=success';
const CANCEL_URL = 'primalphysique://settings?upgrade=cancelled';

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
  const authHeader = req.headers.get('Authorization');

  if (!stripeSecretKey) {
    return jsonResponse({ error: 'STRIPE_SECRET_KEY is not set for this function yet.' }, 500);
  }
  if (!authHeader) {
    return jsonResponse({ error: 'Missing Authorization header.' }, 401);
  }

  // Two separate clients on purpose, same shape delete-client already
  // uses: `caller` carries the REQUESTER's own JWT (proves who's asking
  // via auth.getUser()), `admin` is the service-role client used for the
  // actual privileged lookup/update below -- it's never handed the
  // caller's JWT, so a bug here can't leak elevated access anywhere else.
  const caller = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const {
    data: { user: callerUser },
    error: callerError,
  } = await caller.auth.getUser();

  if (callerError || !callerUser) {
    return jsonResponse({ error: 'Not signed in.' }, 401);
  }

  let requestId: string;
  try {
    const body = await req.json();
    requestId = body.requestId;
    if (!requestId || typeof requestId !== 'string') throw new Error('missing');
  } catch {
    return jsonResponse({ error: 'Request body must include { requestId }.' }, 400);
  }

  const { data: upgradeRequest, error: upgradeRequestError } = await admin
    .from('plan_upgrade_requests')
    .select('id, client_id, requested_tier, status')
    .eq('id', requestId)
    .single();

  if (upgradeRequestError || !upgradeRequest) {
    return jsonResponse({ error: 'That upgrade request no longer exists.' }, 404);
  }
  if (upgradeRequest.client_id !== callerUser.id) {
    return jsonResponse({ error: "That upgrade request isn't yours." }, 403);
  }
  if (upgradeRequest.status !== 'pending') {
    return jsonResponse({ error: 'That upgrade request has already been handled.' }, 400);
  }

  const priceId = PRICE_ID_BY_TIER[upgradeRequest.requested_tier as string];
  if (!priceId) {
    return jsonResponse({ error: `No Stripe price configured for tier "${upgradeRequest.requested_tier}".` }, 500);
  }

  // No explicit apiVersion -- lets the pinned stripe@22.6.1 SDK use
  // whichever API version it ships with, rather than this file naming
  // one by hand that could quietly drift from what that SDK actually
  // supports.
  const stripe = new Stripe(stripeSecretKey);

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: SUCCESS_URL,
      cancel_url: CANCEL_URL,
      client_reference_id: upgradeRequest.id as string,
      metadata: { plan_upgrade_request_id: upgradeRequest.id as string, client_id: upgradeRequest.client_id as string },
    });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Stripe rejected that checkout request.' }, 502);
  }

  if (!session.url) {
    return jsonResponse({ error: 'Stripe did not return a checkout link.' }, 502);
  }

  const { error: updateError } = await admin
    .from('plan_upgrade_requests')
    .update({ stripe_checkout_session_id: session.id })
    .eq('id', upgradeRequest.id as string);

  if (updateError) {
    // The checkout link itself is still good -- log this rather than
    // failing the whole request over a bookkeeping write.
    console.error('Failed to record the Stripe session id on the upgrade request:', updateError);
  }

  return jsonResponse({ url: session.url }, 200);
});
