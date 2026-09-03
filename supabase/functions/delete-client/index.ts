// Deploy via the Supabase dashboard: Edge Functions -> Create a new
// function -> name it "delete-client" -> paste this file's contents ->
// Deploy. No secrets to configure by hand: SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are already available to every Edge
// Function automatically.
//
// This is the ONLY place in the whole app that ever touches the
// service-role key — it can never safely live in the client app itself,
// since that key bypasses every RLS policy in the database. Everything
// this function does (reassigning community posts, deleting storage
// files, deleting the auth account) is therefore also something no
// amount of client-side RLS tuning could do safely instead; it has to
// happen here, behind a real server-side identity check.
//
// What actually deletes almost everything is one line near the bottom:
// admin.auth.admin.deleteUser(clientId). Every personal-data table in
// this schema already has `client_id ... on delete cascade` back to
// profiles, and profiles itself cascades from auth.users — so deleting
// the login is what triggers the entire cascade. The two things
// Postgres cascades can't do on their own are storage files (a DB row
// disappearing doesn't delete the actual file in a bucket) and getting
// community_posts.author_id set to null cleanly BEFORE the profile
// disappears out from under a query trying to read it — the second one
// is actually already handled by a schema change (see
// client-deletion.sql: that foreign key is ON DELETE SET NULL now, so
// Postgres does it automatically as part of the same cascade). Only the
// storage cleanup genuinely needs code here.

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
  const authHeader = req.headers.get('Authorization');

  if (!authHeader) {
    return jsonResponse({ error: 'Missing Authorization header.' }, 401);
  }

  // Two separate clients on purpose: `caller` carries the REQUESTER's own
  // JWT, so auth.getUser() below proves who's actually calling this,
  // under normal RLS. `admin` is the service-role client used for every
  // privileged step afterward -- it's created fresh here, never handed
  // the caller's JWT, so a bug can't accidentally leak elevated access
  // back to the wrong identity.
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

  const { data: callerProfile, error: callerProfileError } = await admin
    .from('profiles')
    .select('role')
    .eq('id', callerUser.id)
    .single();

  if (callerProfileError || callerProfile?.role !== 'coach') {
    return jsonResponse({ error: 'Only a coach can delete a client account.' }, 403);
  }

  let clientId: string;
  try {
    const body = await req.json();
    clientId = body.clientId;
    if (!clientId || typeof clientId !== 'string') throw new Error('missing');
  } catch {
    return jsonResponse({ error: 'Request body must include { clientId }.' }, 400);
  }

  const { data: targetProfile, error: targetProfileError } = await admin
    .from('profiles')
    .select('id, role, full_name, email')
    .eq('id', clientId)
    .single();

  if (targetProfileError || !targetProfile) {
    return jsonResponse({ error: 'That client account no longer exists.' }, 404);
  }
  if (targetProfile.role !== 'client') {
    return jsonResponse({ error: 'That account is not a client.' }, 400);
  }

  // Look this up BEFORE deleting anything -- once the client's profile
  // is gone, so is this row (conversations.client_id also cascades), and
  // there'd be no way left to find which chat-audio folder was theirs.
  const { data: conversation } = await admin
    .from('conversations')
    .select('id')
    .eq('client_id', clientId)
    .maybeSingle();

  // Best-effort storage cleanup -- listed and removed per bucket, since
  // Storage has no bulk "delete everything under this folder" call. A
  // failure here is logged but never blocks the actual account
  // deletion below: an orphaned file left behind is a cheap, harmless
  // outcome next to a client who asked to be deleted still being able
  // to log in because a storage hiccup aborted the whole request.
  async function clearFolder(bucket: string, folder: string) {
    try {
      const { data: files, error: listError } = await admin.storage.from(bucket).list(folder);
      if (listError || !files || files.length === 0) return;
      const paths = files.map((file) => `${folder}/${file.name}`);
      const { error: removeError } = await admin.storage.from(bucket).remove(paths);
      if (removeError) console.error(`Failed to remove ${bucket}/${folder} files:`, removeError);
    } catch (err) {
      console.error(`Failed to clear ${bucket}/${folder}:`, err);
    }
  }

  await clearFolder('progress-photos', clientId);
  if (conversation) {
    await clearFolder('chat-audio', conversation.id as string);
  }

  // The actual point of no return. Cascades: workout_logs, food_logs,
  // weight_logs, body_measurements, tdee_estimates, habits, habit_logs,
  // assignments, programme_blocks (their assigned instance),
  // form_check_ins, form_responses, form_assignments,
  // meal_plan_assignments, readiness_responses,
  // assignment_exercise_swaps, progress_photos, xp_events, client_tiers,
  // community_blocks, community_reports (rows where they were the
  // reporter), conversations + messages (the whole thread, including
  // the coach's own sent messages -- there's no such thing as "only
  // their half" of a 1:1 conversation once one side is gone) -- and
  // sets community_posts.author_id to null (see client-deletion.sql),
  // never deletes those rows.
  const { error: deleteError } = await admin.auth.admin.deleteUser(clientId);

  if (deleteError) {
    return jsonResponse({ error: deleteError.message }, 500);
  }

  return jsonResponse({ success: true }, 200);
});
