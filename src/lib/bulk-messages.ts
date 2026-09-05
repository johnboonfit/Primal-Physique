import { decode } from 'base64-arraybuffer';

import { getOrCreateConversation } from '@/lib/chat';
import { supabase } from '@/lib/supabase';

export type RepeatCadence = 'none' | 'daily' | 'weekly' | 'monthly';

export type BulkAttachmentInput =
  | { kind: 'image'; base64: string; mimeType: string }
  | { kind: 'file'; base64: string; fileName: string; mimeType: string };

export type BulkMessageSeries = {
  id: string;
  label: string;
  body: string;
  attachmentFileName: string | null;
  repeatCadence: RepeatCadence;
  nextRunAt: string | null;
  timesFired: number;
  recipientCount: number;
  createdAt: string;
};

const ATTACHMENT_BUCKET = 'chat-attachments';

async function uploadBulkAttachment(
  seriesId: string,
  attachment: BulkAttachmentInput
): Promise<{ path: string; fileName: string | null; mimeType: string }> {
  if (attachment.kind === 'image') {
    const ext = attachment.mimeType === 'image/png' ? 'png' : 'jpg';
    const path = `bulk/${seriesId}/attachment.${ext}`;
    const { error } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .upload(path, decode(attachment.base64), { contentType: attachment.mimeType });
    if (error) throw error;
    return { path, fileName: null, mimeType: attachment.mimeType };
  }

  const safeName = attachment.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `bulk/${seriesId}/${safeName}`;
  const { error } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .upload(path, decode(attachment.base64), { contentType: attachment.mimeType });
  if (error) throw error;
  return { path, fileName: attachment.fileName, mimeType: attachment.mimeType };
}

/**
 * One real message per recipient, right now — the client-side
 * equivalent of the "Send Now" button. Never touches next_run_at or
 * pg_cron; a scheduled/recurring series is the only kind
 * dispatch_due_bulk_message_series() (bulk-messages.sql) ever fires.
 */
async function fireBulkMessageSeriesNow(
  seriesId: string,
  coachId: string,
  body: string,
  clientIds: string[],
  attachmentPath: string | null,
  attachmentFileName: string | null,
  attachmentMimeType: string | null
): Promise<void> {
  const kind = !attachmentPath ? 'text' : attachmentMimeType?.startsWith('image/') ? 'image' : 'file';

  for (const clientId of clientIds) {
    const conversationId = await getOrCreateConversation(clientId);
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: coachId,
        kind,
        body,
        attachment_storage_path: attachmentPath,
        attachment_file_name: attachmentFileName,
        attachment_mime_type: attachmentMimeType,
      })
      .select('id')
      .single();
    if (messageError) throw messageError;

    const { error: deliveryError } = await supabase
      .from('bulk_message_deliveries')
      .insert({ series_id: seriesId, client_id: clientId, message_id: message.id as string });
    if (deliveryError) throw deliveryError;
  }

  const { error: updateError } = await supabase
    .from('bulk_message_series')
    .update({ times_fired: 1, active: false })
    .eq('id', seriesId);
  if (updateError) throw updateError;
}

/**
 * Creates the series row + recipient snapshot, uploads the attachment
 * (if any) under the series' own id so the storage RLS in
 * chat-attachments.sql/bulk-messages.sql can key off it, then either
 * fires it immediately (one real message per recipient, same as
 * sending each one by hand) or leaves it active with a next_run_at for
 * dispatch_due_bulk_message_series() to pick up later.
 */
export async function createBulkMessageSeries(params: {
  coachId: string;
  label: string;
  body: string;
  clientIds: string[];
  attachment: BulkAttachmentInput | null;
  sendAt: 'now' | string;
  repeatCadence: RepeatCadence;
}): Promise<void> {
  const { coachId, label, body, clientIds, attachment, sendAt, repeatCadence } = params;
  if (clientIds.length === 0) throw new Error('Select at least one client.');

  const { data: series, error: seriesError } = await supabase
    .from('bulk_message_series')
    .insert({
      coach_id: coachId,
      label: label.trim() || body.slice(0, 40),
      body,
      repeat_cadence: sendAt === 'now' ? 'none' : repeatCadence,
      next_run_at: sendAt === 'now' ? null : sendAt,
      active: sendAt !== 'now',
    })
    .select('id')
    .single();
  if (seriesError) throw seriesError;
  const seriesId = series.id as string;

  const { error: recipientsError } = await supabase
    .from('bulk_message_recipients')
    .insert(clientIds.map((clientId) => ({ series_id: seriesId, client_id: clientId })));
  if (recipientsError) throw recipientsError;

  let attachmentPath: string | null = null;
  let attachmentFileName: string | null = null;
  let attachmentMimeType: string | null = null;
  if (attachment) {
    const uploaded = await uploadBulkAttachment(seriesId, attachment);
    attachmentPath = uploaded.path;
    attachmentFileName = uploaded.fileName;
    attachmentMimeType = uploaded.mimeType;

    const { error: updateError } = await supabase
      .from('bulk_message_series')
      .update({
        attachment_storage_path: attachmentPath,
        attachment_file_name: attachmentFileName,
        attachment_mime_type: attachmentMimeType,
      })
      .eq('id', seriesId);
    if (updateError) throw updateError;
  }

  if (sendAt === 'now') {
    await fireBulkMessageSeriesNow(seriesId, coachId, body, clientIds, attachmentPath, attachmentFileName, attachmentMimeType);
  }
}

/**
 * Active series with a future/pending next_run_at, soonest first —
 * everything a coach would want on a "Scheduled Messages" screen.
 * An instant Send Now never shows up here: it's created with
 * next_run_at null and active false the moment it's sent (see
 * fireBulkMessageSeriesNow() above).
 */
export async function listScheduledBulkMessageSeries(): Promise<BulkMessageSeries[]> {
  const { data, error } = await supabase
    .from('bulk_message_series')
    .select(
      'id, label, body, attachment_file_name, repeat_cadence, next_run_at, times_fired, created_at, bulk_message_recipients(count)'
    )
    .eq('active', true)
    .not('next_run_at', 'is', null)
    .order('next_run_at', { ascending: true });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    label: row.label as string,
    body: row.body as string,
    attachmentFileName: row.attachment_file_name as string | null,
    repeatCadence: row.repeat_cadence as RepeatCadence,
    nextRunAt: row.next_run_at as string | null,
    timesFired: row.times_fired as number,
    recipientCount: (row.bulk_message_recipients as { count: number }[] | null)?.[0]?.count ?? 0,
    createdAt: row.created_at as string,
  }));
}

/** Stops all future sends but keeps the series' history intact — a
 * cancelled series just stops matching dispatch_due_bulk_message_series()'s
 * `where active` clause, it's never deleted. */
export async function cancelBulkMessageSeries(seriesId: string): Promise<void> {
  const { error } = await supabase.from('bulk_message_series').update({ active: false }).eq('id', seriesId);
  if (error) throw error;
}
