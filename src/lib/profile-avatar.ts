import { decode } from 'base64-arraybuffer';

import { supabase } from '@/lib/supabase';

const BUCKET = 'avatars';
// Long enough to cover one screen session (Settings, or Home's header)
// without needing to re-sign mid-visit -- same window progress-photos.ts
// already uses for the same reason.
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60;

/** Two-letter placeholder for anyone who hasn't uploaded a real profile
 * picture yet -- first letter of the first two words of whatever name
 * is available, or the first two characters of the email if there's no
 * name at all. */
export function initials(fullName: string | null, email: string): string {
  const source = (fullName ?? '').trim();
  if (source) {
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return source.slice(0, 2).toUpperCase();
  }
  return (email.trim().slice(0, 2) || '?').toUpperCase();
}

/** A signed URL for this user's current avatar, or null if they've
 * never uploaded one -- the bucket is private, so there's no permanent
 * public URL to store (same reason progress-photos.ts signs fresh on
 * every read instead). */
export async function getAvatarUrl(userId: string): Promise<string | null> {
  const { data, error } = await supabase.from('profiles').select('avatar_storage_path').eq('id', userId).single();
  if (error) throw error;

  const path = data.avatar_storage_path as string | null;
  if (!path) return null;

  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS);
  if (signError) throw signError;
  return signed.signedUrl;
}

/**
 * Uploads a new avatar and returns a signed URL for it right away, so
 * the screen that just uploaded it can show the real photo immediately
 * without a second round trip. `base64` comes straight from
 * expo-image-picker's `base64: true` option, decoded to an ArrayBuffer
 * before uploading -- the same approach every other image upload in
 * this app uses, since React Native's Blob/File/FormData path doesn't
 * work reliably against Supabase Storage.
 *
 * A fresh, timestamped filename every time (never overwritten in
 * place, same as progress photos) -- the previous file, if any, is
 * only deleted once the new one is safely recorded, so a failure
 * partway through never leaves the profile pointing at nothing.
 */
export async function uploadAvatar(userId: string, base64: string, mimeType: string): Promise<string> {
  const { data: existing, error: fetchError } = await supabase
    .from('profiles')
    .select('avatar_storage_path')
    .eq('id', userId)
    .single();
  if (fetchError) throw fetchError;
  const previousPath = existing.avatar_storage_path as string | null;

  const ext = mimeType === 'image/png' ? 'png' : 'jpg';
  const path = `${userId}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, decode(base64), { contentType: mimeType });
  if (uploadError) throw uploadError;

  const { error: updateError } = await supabase.from('profiles').update({ avatar_storage_path: path }).eq('id', userId);
  if (updateError) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw updateError;
  }

  if (previousPath) {
    await supabase.storage.from(BUCKET).remove([previousPath]);
  }

  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS);
  if (signError) throw signError;
  return signed.signedUrl;
}

/** Removes the current avatar file and clears the column, reverting to
 * the initials placeholder everywhere it shows. */
export async function removeAvatar(userId: string): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from('profiles')
    .select('avatar_storage_path')
    .eq('id', userId)
    .single();
  if (fetchError) throw fetchError;
  const path = existing.avatar_storage_path as string | null;

  const { error: updateError } = await supabase.from('profiles').update({ avatar_storage_path: null }).eq('id', userId);
  if (updateError) throw updateError;

  if (path) {
    await supabase.storage.from(BUCKET).remove([path]);
  }
}
