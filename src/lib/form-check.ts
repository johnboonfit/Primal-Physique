import { decode } from 'base64-arraybuffer';

import { supabase } from '@/lib/supabase';

const BUCKET = 'form-check-videos';
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60;

export type FormCheckStatus = 'pending' | 'reviewed';

export type ClientFormCheckSubmission = {
  id: string;
  exerciseName: string;
  clientNote: string | null;
  videoUrl: string;
  status: FormCheckStatus;
  feedbackText: string | null;
  feedbackVideoUrl: string | null;
  createdAt: string;
};

export type CoachFormCheckSubmission = ClientFormCheckSubmission & {
  clientId: string;
  clientName: string;
};

type SubmissionRow = {
  id: string;
  client_id?: string;
  exercise_name: string;
  client_note: string | null;
  video_storage_path: string;
  status: FormCheckStatus;
  feedback_text: string | null;
  feedback_video_storage_path: string | null;
  created_at: string;
  profiles?: { full_name: string | null; email: string | null } | null;
};

/** Signs every video path a batch of rows references (client-submitted
 * and, where present, the coach's own feedback video) in one call, same
 * batch-createSignedUrls approach chat.ts's listMessages() already uses
 * for attachments -- never a bare storage path, since the bucket is
 * private. */
async function signAll(rows: SubmissionRow[]): Promise<Map<string, string>> {
  const paths = new Set<string>();
  rows.forEach((row) => {
    paths.add(row.video_storage_path);
    if (row.feedback_video_storage_path) paths.add(row.feedback_video_storage_path);
  });
  if (paths.size === 0) return new Map();

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(Array.from(paths), SIGNED_URL_EXPIRY_SECONDS);
  if (error) throw error;

  const map = new Map<string, string>();
  (data ?? []).forEach((entry) => {
    if (entry.path && entry.signedUrl) map.set(entry.path, entry.signedUrl);
  });
  return map;
}

function toClientSubmission(row: SubmissionRow, urlByPath: Map<string, string>): ClientFormCheckSubmission {
  return {
    id: row.id,
    exerciseName: row.exercise_name,
    clientNote: row.client_note,
    videoUrl: urlByPath.get(row.video_storage_path) ?? '',
    status: row.status,
    feedbackText: row.feedback_text,
    feedbackVideoUrl: row.feedback_video_storage_path ? (urlByPath.get(row.feedback_video_storage_path) ?? '') : null,
    createdAt: row.created_at,
  };
}

/** A client's own submissions, newest first. */
export async function listMyFormCheckSubmissions(clientId: string): Promise<ClientFormCheckSubmission[]> {
  const { data, error } = await supabase
    .from('form_check_submissions')
    .select('id, exercise_name, client_note, video_storage_path, status, feedback_text, feedback_video_storage_path, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as SubmissionRow[];
  const urlByPath = await signAll(rows);
  return rows.map((row) => toClientSubmission(row, urlByPath));
}

/** Every client's submissions, pending ones first (oldest pending
 * first, so the coach works through a queue), reviewed ones after. */
export async function listCoachFormCheckSubmissions(): Promise<CoachFormCheckSubmission[]> {
  const { data, error } = await supabase
    .from('form_check_submissions')
    .select(
      'id, client_id, exercise_name, client_note, video_storage_path, status, feedback_text, feedback_video_storage_path, created_at, profiles!client_id(full_name, email)'
    )
    .order('created_at', { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as unknown as SubmissionRow[];
  const urlByPath = await signAll(rows);

  const submissions = rows.map((row) => ({
    ...toClientSubmission(row, urlByPath),
    clientId: row.client_id as string,
    clientName: row.profiles?.full_name || row.profiles?.email?.split('@')[0] || 'Unknown',
  }));

  const pending = submissions.filter((s) => s.status === 'pending');
  const reviewed = submissions.filter((s) => s.status === 'reviewed').reverse();
  return [...pending, ...reviewed];
}

export async function getCoachFormCheckSubmission(submissionId: string): Promise<CoachFormCheckSubmission> {
  const { data, error } = await supabase
    .from('form_check_submissions')
    .select(
      'id, client_id, exercise_name, client_note, video_storage_path, status, feedback_text, feedback_video_storage_path, created_at, profiles!client_id(full_name, email)'
    )
    .eq('id', submissionId)
    .single();
  if (error) throw error;

  const row = data as unknown as SubmissionRow;
  const urlByPath = await signAll([row]);
  return {
    ...toClientSubmission(row, urlByPath),
    clientId: row.client_id as string,
    clientName: row.profiles?.full_name || row.profiles?.email?.split('@')[0] || 'Unknown',
  };
}

/**
 * Uploads the client's recorded/picked video (base64, same
 * read-then-decode()-then-upload convention chat.ts's voice/photo/
 * document attachments already use) and inserts the submission row.
 * Rolls the upload back if the insert fails, same as chat.ts.
 */
export async function submitFormCheck(params: {
  clientId: string;
  exerciseName: string;
  clientNote: string;
  base64: string;
  fileExtension: string;
  mimeType: string;
}): Promise<void> {
  const { clientId, exerciseName, clientNote, base64, fileExtension, mimeType } = params;
  const path = `${clientId}/${Date.now()}.${fileExtension}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, decode(base64), { contentType: mimeType });
  if (uploadError) throw uploadError;

  const { error } = await supabase.from('form_check_submissions').insert({
    client_id: clientId,
    exercise_name: exerciseName,
    client_note: clientNote.trim() || null,
    video_storage_path: path,
  });

  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw error;
  }
}

/**
 * The coach's response — written feedback, always; a follow-up video,
 * only when they recorded/picked one. Marks the submission reviewed.
 */
export async function respondToFormCheck(params: {
  submissionId: string;
  clientId: string;
  feedbackText: string;
  video?: { base64: string; fileExtension: string; mimeType: string } | null;
}): Promise<void> {
  const { submissionId, clientId, feedbackText, video } = params;

  let feedbackVideoPath: string | null = null;
  if (video) {
    feedbackVideoPath = `${clientId}/coach-${Date.now()}.${video.fileExtension}`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(feedbackVideoPath, decode(video.base64), { contentType: video.mimeType });
    if (uploadError) throw uploadError;
  }

  const { error } = await supabase
    .from('form_check_submissions')
    .update({
      feedback_text: feedbackText.trim(),
      feedback_video_storage_path: feedbackVideoPath,
      status: 'reviewed',
      responded_at: new Date().toISOString(),
    })
    .eq('id', submissionId);

  if (error) {
    if (feedbackVideoPath) await supabase.storage.from(BUCKET).remove([feedbackVideoPath]);
    throw error;
  }
}
