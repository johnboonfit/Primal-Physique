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
