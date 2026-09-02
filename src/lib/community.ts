import { decode } from 'base64-arraybuffer';

import { supabase } from '@/lib/supabase';

export type CommunityTag = 'announcement' | 'win' | 'pr' | 'question';

export const COMMUNITY_TAGS: { key: CommunityTag; label: string; emoji: string; coachOnly: boolean }[] = [
  { key: 'announcement', label: 'Announcement', emoji: '📢', coachOnly: true },
  { key: 'win', label: 'Win', emoji: '🏆', coachOnly: false },
  { key: 'pr', label: 'PR', emoji: '💪', coachOnly: false },
  { key: 'question', label: 'Question', emoji: '❓', coachOnly: false },
];

const BUCKET = 'community-images';
// Long enough to cover one feed-browsing session without needing to
// re-sign mid-scroll — same figure progress-photos.ts uses.
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60;

export type CommunityPost = {
  id: string;
  authorId: string;
  authorName: string;
  tag: CommunityTag;
  body: string;
  imageUrl: string | null;
  reactionCount: number;
  commentCount: number;
  createdAt: string;
};

/** The whole feed, most recent first — every post regardless of who
 * wrote it. See community_posts.sql's "shared feed" select policy. */
export async function listCommunityPosts(): Promise<CommunityPost[]> {
  const { data, error } = await supabase
    .from('community_posts')
    .select(
      'id, author_id, tag, body, image_storage_path, reaction_count, comment_count, created_at, profiles!author_id(full_name, email)'
    )
    .order('created_at', { ascending: false });

  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const paths = rows.map((row) => row.image_storage_path as string | null).filter((p): p is string => p !== null);

  const urlByPath = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signedUrls, error: signError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(paths, SIGNED_URL_EXPIRY_SECONDS);
    if (signError) throw signError;
    (signedUrls ?? []).forEach((entry) => {
      if (entry.path && entry.signedUrl) urlByPath.set(entry.path, entry.signedUrl);
    });
  }

  return rows.map((row) => {
    const author = row.profiles as unknown as { full_name: string | null; email: string } | null;
    const imagePath = row.image_storage_path as string | null;

    return {
      id: row.id as string,
      authorId: row.author_id as string,
      authorName: author?.full_name || author?.email?.split('@')[0] || 'Unknown',
      tag: row.tag as CommunityTag,
      body: row.body as string,
      imageUrl: imagePath ? (urlByPath.get(imagePath) ?? null) : null,
      reactionCount: row.reaction_count as number,
      commentCount: row.comment_count as number,
      createdAt: row.created_at as string,
    };
  });
}

/**
 * Creates a post as the given author. `tag` is sent exactly as chosen —
 * the Announcement-is-coach-only rule is deliberately NOT re-checked
 * here. It's enforced by community_posts.sql's insert policy, which runs
 * against the real signed-in user regardless of what this function
 * sends, so a client-role account calling this with tag: 'announcement'
 * gets a real Postgres RLS error back, not a silently-downgraded post.
 */
export async function createCommunityPost(params: {
  authorId: string;
  tag: CommunityTag;
  body: string;
  imageBase64?: string;
}): Promise<void> {
  let imagePath: string | null = null;

  if (params.imageBase64) {
    imagePath = `${params.authorId}/${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(imagePath, decode(params.imageBase64), { contentType: 'image/jpeg' });
    if (uploadError) throw uploadError;
  }

  const { error } = await supabase.from('community_posts').insert({
    author_id: params.authorId,
    tag: params.tag,
    body: params.body,
    image_storage_path: imagePath,
  });

  if (error) {
    if (imagePath) await supabase.storage.from(BUCKET).remove([imagePath]);
    throw error;
  }
}

/** The coach's app-wide switch — false means Community is unavailable
 * to every client, regardless of any individual client's own
 * community_hidden preference below. */
export async function getCommunityEnabled(): Promise<boolean> {
  const { data, error } = await supabase.from('app_settings').select('community_enabled').eq('id', true).single();
  if (error) throw error;
  return data.community_enabled as boolean;
}

/** Coach-only in practice — enforced by app_settings.sql's update
 * policy the same way the Announcement restriction is, not just by
 * hiding the control from clients. */
export async function setCommunityEnabled(enabled: boolean): Promise<void> {
  const { error } = await supabase.from('app_settings').update({ community_enabled: enabled }).eq('id', true);
  if (error) throw error;
}

/** One person's own "hide Community for me" preference — independent
 * of the coach's app-wide switch above, and only ever readable/settable
 * for your own account (auth.uid() = id, same as every profile field). */
export async function getCommunityHidden(userId: string): Promise<boolean> {
  const { data, error } = await supabase.from('profiles').select('community_hidden').eq('id', userId).single();
  if (error) throw error;
  return data.community_hidden as boolean;
}

export async function setCommunityHidden(userId: string, hidden: boolean): Promise<void> {
  const { error } = await supabase.from('profiles').update({ community_hidden: hidden }).eq('id', userId);
  if (error) throw error;
}

/** Postgres' unique-violation code — used to turn a duplicate report
 * into a plain message instead of a raw database error. */
const UNIQUE_VIOLATION = '23505';

/**
 * Reports a post. `reason` is optional — a report with nothing typed in
 * is still a real, actionable signal to the coach. Reporting the same
 * post twice as the same person throws a friendly error instead of a
 * raw Postgres one; see community_reports' unique(post_id, reporter_id).
 */
export async function reportPost(postId: string, reporterId: string, reason?: string): Promise<void> {
  const { error } = await supabase.from('community_reports').insert({
    post_id: postId,
    reporter_id: reporterId,
    reason: reason?.trim() || null,
  });

  if (error) {
    if (error.code === UNIQUE_VIOLATION) throw new Error("You've already reported this post.");
    throw error;
  }
}

/**
 * Deletes a post. Works identically whether the caller is the post's
 * own author or the coach — community_posts.sql's two delete policies
 * (author-of-their-own, or coach-of-any) decide which of those is
 * actually allowed for whoever's really signed in; this function
 * doesn't need to know or check which case it is.
 *
 * Cleans up the post's image from storage too, best-effort — a delete
 * that already succeeded in the database isn't rolled back over a
 * failed file cleanup; it would just leave an orphaned, harmless file.
 */
export async function deletePost(postId: string): Promise<void> {
  const { data, error } = await supabase
    .from('community_posts')
    .delete()
    .eq('id', postId)
    .select('image_storage_path')
    .single();

  if (error) throw error;

  const imagePath = data?.image_storage_path as string | null;
  if (imagePath) {
    const { error: removeError } = await supabase.storage.from(BUCKET).remove([imagePath]);
    if (removeError) console.error('Failed to remove community post image after delete:', removeError);
  }
}

export type ModerationReport = {
  id: string;
  postId: string;
  postBody: string;
  postTag: CommunityTag;
  postAuthorId: string;
  postAuthorName: string;
  reporterName: string;
  reason: string | null;
  createdAt: string;
};

/** Every still-open report, coach-only (see community_reports' select
 * policy) — this is what feeds the moderation screen. If the same post
 * has two open reports, it appears twice, once per report, since
 * dismissing one shouldn't silently dismiss the other.
 *
 * `profiles` is embedded twice here — once for the reported post's
 * author, once for the reporter — and PostgREST needs each occurrence
 * of the SAME target table in one query aliased distinctly
 * (`alias:table!fk_hint`), not just the FK hint alone, or it can fail
 * to resolve the query at all rather than silently picking one. */
export async function getOpenReports(): Promise<ModerationReport[]> {
  const { data, error } = await supabase
    .from('community_reports')
    .select(
      'id, post_id, reason, created_at, community_posts(id, body, tag, author_id, post_author:profiles!author_id(full_name, email)), reporter:profiles!reporter_id(full_name, email)'
    )
    .eq('status', 'open')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const post = row.community_posts as unknown as {
      id: string;
      body: string;
      tag: CommunityTag;
      author_id: string;
      post_author: { full_name: string | null; email: string } | null;
    } | null;
    const reporter = row.reporter as unknown as { full_name: string | null; email: string } | null;

    return {
      id: row.id as string,
      postId: post?.id ?? (row.post_id as string),
      postBody: post?.body ?? '(post no longer exists)',
      postTag: (post?.tag ?? 'question') as CommunityTag,
      postAuthorId: post?.author_id ?? '',
      postAuthorName: post?.post_author?.full_name || post?.post_author?.email?.split('@')[0] || 'Unknown',
      reporterName: reporter?.full_name || reporter?.email?.split('@')[0] || 'Unknown',
      reason: row.reason as string | null,
      createdAt: row.created_at as string,
    };
  });
}

/** Marks a report reviewed with no further action — coach-only, see
 * community_reports' update policy. Doesn't touch the post or the
 * author; use deletePost/blockClient for those. */
export async function dismissReport(reportId: string): Promise<void> {
  const { error } = await supabase.from('community_reports').update({ status: 'dismissed' }).eq('id', reportId);
  if (error) throw error;
}

export type BlockedClient = {
  clientId: string;
  name: string;
  blockedAt: string;
};

/** Coach-only. Blocking is upsert-like on purpose — clicking Block from
 * two different open reports naming the same author, before the list
 * refreshes, should never throw a duplicate-key error. */
export async function blockClient(clientId: string): Promise<void> {
  const { error } = await supabase.from('community_blocks').upsert({ client_id: clientId }, { onConflict: 'client_id' });
  if (error) throw error;
}

export async function unblockClient(clientId: string): Promise<void> {
  const { error } = await supabase.from('community_blocks').delete().eq('client_id', clientId);
  if (error) throw error;
}

/** Coach-only read of every currently blocked client, for the
 * moderation screen's "Blocked clients" list. */
export async function listBlockedClients(): Promise<BlockedClient[]> {
  const { data, error } = await supabase
    .from('community_blocks')
    .select('client_id, blocked_at, profiles!client_id(full_name, email)')
    .order('blocked_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const client = row.profiles as unknown as { full_name: string | null; email: string } | null;
    return {
      clientId: row.client_id as string,
      name: client?.full_name || client?.email?.split('@')[0] || 'Unknown',
      blockedAt: row.blocked_at as string,
    };
  });
}

/** Whether the given account is currently blocked from posting — a
 * client can only ever check their own (see community_blocks' select
 * policy), used by the compose screen to show a plain explanation
 * instead of letting a blocked client hit a raw database error. */
export async function isBlocked(clientId: string): Promise<boolean> {
  const { data, error } = await supabase.from('community_blocks').select('client_id').eq('client_id', clientId).maybeSingle();
  if (error) throw error;
  return data !== null;
}
