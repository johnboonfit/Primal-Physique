import { decode } from 'base64-arraybuffer';

import { supabase } from '@/lib/supabase';

export type PhotoAngle = 'front' | 'side' | 'back';

export const PHOTO_ANGLES: { key: PhotoAngle; label: string }[] = [
  { key: 'front', label: 'Front' },
  { key: 'side', label: 'Side' },
  { key: 'back', label: 'Back' },
];

export type ProgressPhoto = {
  id: string;
  logDate: string;
  angle: PhotoAngle;
  storagePath: string;
  /** A signed URL, generated fresh every time photos are listed — the
   * bucket is private, so there's no permanent public URL to store. */
  url: string;
};

const BUCKET = 'progress-photos';
// Long enough to cover one screen session (browsing the gallery, then
// opening the compare tool) without needing to re-sign mid-visit.
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60;

/**
 * Uploads one photo and records it. `base64` comes straight from
 * expo-image-picker's `base64: true` option — React Native's Blob/File/
 * FormData upload path doesn't work reliably against Supabase Storage,
 * so this decodes to an ArrayBuffer instead, which is the officially
 * recommended approach for uploading from React Native.
 *
 * If the database insert fails after the file itself uploaded
 * successfully, the orphaned file is removed rather than left behind
 * with no record pointing at it.
 */
export async function uploadProgressPhoto(clientId: string, logDate: string, angle: PhotoAngle, base64: string) {
  const path = `${clientId}/${angle}/${logDate}-${Date.now()}.jpg`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, decode(base64), {
    contentType: 'image/jpeg',
  });

  if (uploadError) throw uploadError;

  const { error: insertError } = await supabase.from('progress_photos').insert({
    client_id: clientId,
    log_date: logDate,
    angle,
    storage_path: path,
  });

  if (insertError) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw insertError;
  }
}

/** Every photo of every angle (or just one angle, if given), most
 * recent first, each with a freshly signed URL ready to display. */
export async function listProgressPhotos(clientId: string, angle?: PhotoAngle): Promise<ProgressPhoto[]> {
  let query = supabase
    .from('progress_photos')
    .select('id, log_date, angle, storage_path')
    .eq('client_id', clientId)
    .order('log_date', { ascending: false });

  if (angle) query = query.eq('angle', angle);

  const { data, error } = await query;
  if (error) throw error;

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const paths = rows.map((row) => row.storage_path as string);
  const { data: signedUrls, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, SIGNED_URL_EXPIRY_SECONDS);

  if (signError) throw signError;

  const urlByPath = new Map((signedUrls ?? []).map((entry) => [entry.path, entry.signedUrl]));

  return rows.map((row) => ({
    id: row.id as string,
    logDate: row.log_date as string,
    angle: row.angle as PhotoAngle,
    storagePath: row.storage_path as string,
    url: urlByPath.get(row.storage_path as string) ?? '',
  }));
}
