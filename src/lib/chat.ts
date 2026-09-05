import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';

import { supabase } from '@/lib/supabase';

export type MessageKind = 'text' | 'voice' | 'image' | 'file';

/** Voice recordings auto-stop at exactly this length. */
export const MAX_VOICE_MESSAGE_SECONDS = 15 * 60;

/** A sender can still edit or delete-for-everyone their own message
 * within this window — matches the check baked into messages' own
 * update policy in chat.sql, this is just the client-side courtesy
 * copy of that same rule (so the UI can hide the option before the
 * database would reject it, not instead of the database rejecting it). */
const DELETE_FOR_EVERYONE_WINDOW_SECONDS = 30 * 60;

/** "Online" is a heuristic, not a stored fact — last_seen_at within
 * this many seconds counts as online. No realtime presence channel,
 * just a heartbeat the app writes while a chat screen is open. */
const ONLINE_THRESHOLD_SECONDS = 90;

const AUDIO_BUCKET = 'chat-audio';
const ATTACHMENT_BUCKET = 'chat-attachments';
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60;

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  kind: MessageKind;
  body: string | null;
  originalBody: string | null;
  audioUrl: string | null;
  audioDurationSeconds: number | null;
  attachmentUrl: string | null;
  attachmentFileName: string | null;
  attachmentMimeType: string | null;
  attachmentSizeBytes: number | null;
  editedAt: string | null;
  deletedForEveryone: boolean;
  createdAt: string;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  kind: MessageKind;
  body: string | null;
  original_body: string | null;
  audio_storage_path: string | null;
  audio_duration_seconds: number | null;
  attachment_storage_path: string | null;
  attachment_file_name: string | null;
  attachment_mime_type: string | null;
  attachment_size_bytes: number | null;
  edited_at: string | null;
  deleted_for_everyone_at: string | null;
  created_at: string;
  profiles: { full_name: string | null; email: string } | null;
};

function toChatMessage(row: MessageRow, audioUrlByPath: Map<string, string>, attachmentUrlByPath: Map<string, string>): ChatMessage {
  const sender = row.profiles;
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    senderName: sender?.full_name || sender?.email?.split('@')[0] || 'Unknown',
    kind: row.kind,
    body: row.body,
    originalBody: row.original_body,
    audioUrl: row.audio_storage_path ? (audioUrlByPath.get(row.audio_storage_path) ?? null) : null,
    audioDurationSeconds: row.audio_duration_seconds,
    attachmentUrl: row.attachment_storage_path ? (attachmentUrlByPath.get(row.attachment_storage_path) ?? null) : null,
    attachmentFileName: row.attachment_file_name,
    attachmentMimeType: row.attachment_mime_type,
    attachmentSizeBytes: row.attachment_size_bytes,
    editedAt: row.edited_at,
    deletedForEveryone: row.deleted_for_everyone_at !== null,
    createdAt: row.created_at,
  };
}

/** One conversation per client, created the first time either side
 * opens it — see chat.sql's two insert policies (a client can create
 * their own, a coach can create one for any client). */
export async function getOrCreateConversation(clientId: string): Promise<string> {
  const { data: existing, error: selectError } = await supabase
    .from('conversations')
    .select('id')
    .eq('client_id', clientId)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing) return existing.id as string;

  const { data: created, error: insertError } = await supabase
    .from('conversations')
    .insert({ client_id: clientId })
    .select('id')
    .single();
  if (insertError) throw insertError;
  return created.id as string;
}

/** Every message in the conversation, oldest first, with anything this
 * viewer has "deleted for me" already filtered out — that filtering
 * happens here, in the app, rather than as a row-level policy, since
 * "hidden for me" is a per-viewer preference layered on top of a
 * message everyone else can still see, not a real access restriction. */
export async function listMessages(conversationId: string, viewerId: string): Promise<ChatMessage[]> {
  const [messagesRes, hiddenRes] = await Promise.all([
    supabase
      .from('messages')
      .select(
        'id, conversation_id, sender_id, kind, body, original_body, audio_storage_path, audio_duration_seconds, attachment_storage_path, attachment_file_name, attachment_mime_type, attachment_size_bytes, edited_at, deleted_for_everyone_at, created_at, profiles!sender_id(full_name, email)'
      )
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true }),
    supabase.from('message_hidden_for').select('message_id').eq('user_id', viewerId),
  ]);

  if (messagesRes.error) throw messagesRes.error;
  if (hiddenRes.error) throw hiddenRes.error;

  const hiddenIds = new Set((hiddenRes.data ?? []).map((row) => row.message_id as string));
  const rows = (messagesRes.data ?? []).filter((row) => !hiddenIds.has(row.id as string)) as unknown as MessageRow[];

  const audioPaths = rows.map((row) => row.audio_storage_path).filter((p): p is string => p !== null);
  const audioUrlByPath = new Map<string, string>();
  if (audioPaths.length > 0) {
    const { data: signedUrls, error: signError } = await supabase.storage
      .from(AUDIO_BUCKET)
      .createSignedUrls(audioPaths, SIGNED_URL_EXPIRY_SECONDS);
    if (signError) throw signError;
    (signedUrls ?? []).forEach((entry) => {
      if (entry.path && entry.signedUrl) audioUrlByPath.set(entry.path, entry.signedUrl);
    });
  }

  const attachmentPaths = rows.map((row) => row.attachment_storage_path).filter((p): p is string => p !== null);
  const attachmentUrlByPath = new Map<string, string>();
  if (attachmentPaths.length > 0) {
    const { data: signedUrls, error: signError } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .createSignedUrls(attachmentPaths, SIGNED_URL_EXPIRY_SECONDS);
    if (signError) throw signError;
    (signedUrls ?? []).forEach((entry) => {
      if (entry.path && entry.signedUrl) attachmentUrlByPath.set(entry.path, entry.signedUrl);
    });
  }

  return rows.map((row) => toChatMessage(row, audioUrlByPath, attachmentUrlByPath));
}

export async function sendTextMessage(conversationId: string, senderId: string, body: string): Promise<void> {
  const { error } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    sender_id: senderId,
    kind: 'text',
    body,
  });
  if (error) throw error;
}

/**
 * Uploads the local recording and inserts its message row. Reads the
 * file as base64 and decodes to an ArrayBuffer before uploading — the
 * same approach progress-photos.ts and community.ts already use,
 * because React Native's Blob/File/FormData upload path doesn't work
 * reliably against Supabase Storage.
 */
export async function sendVoiceMessage(
  conversationId: string,
  senderId: string,
  localUri: string,
  durationSeconds: number
): Promise<void> {
  const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: 'base64' });
  const path = `${conversationId}/${senderId}-${Date.now()}.m4a`;

  const { error: uploadError } = await supabase.storage.from(AUDIO_BUCKET).upload(path, decode(base64), {
    contentType: 'audio/m4a',
  });
  if (uploadError) throw uploadError;

  const { error } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    sender_id: senderId,
    kind: 'voice',
    audio_storage_path: path,
    audio_duration_seconds: Math.round(durationSeconds),
  });

  if (error) {
    await supabase.storage.from(AUDIO_BUCKET).remove([path]);
    throw error;
  }
}

/**
 * Uploads a photo (already base64-encoded by the picker, same
 * convention community.ts/progress-photos.ts already use) and inserts
 * its message row.
 */
export async function sendImageMessage(
  conversationId: string,
  senderId: string,
  base64: string,
  mimeType: string
): Promise<void> {
  const ext = mimeType === 'image/png' ? 'png' : 'jpg';
  const path = `${conversationId}/${senderId}-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .upload(path, decode(base64), { contentType: mimeType });
  if (uploadError) throw uploadError;

  const { error } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    sender_id: senderId,
    kind: 'image',
    attachment_storage_path: path,
    attachment_mime_type: mimeType,
  });

  if (error) {
    await supabase.storage.from(ATTACHMENT_BUCKET).remove([path]);
    throw error;
  }
}

/**
 * Uploads a document (PDF, etc.) picked via expo-document-picker.
 * Takes base64 rather than a local uri — expo-document-picker only
 * returns base64 itself on web, so the caller reads the file via
 * FileSystem on native and passes whichever base64 string it ends up
 * with, the same shape sendImageMessage() already takes.
 */
export async function sendFileMessage(
  conversationId: string,
  senderId: string,
  base64: string,
  fileName: string,
  mimeType: string,
  sizeBytes: number | null
): Promise<void> {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${conversationId}/${senderId}-${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .upload(path, decode(base64), { contentType: mimeType });
  if (uploadError) throw uploadError;

  const { error } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    sender_id: senderId,
    kind: 'file',
    attachment_storage_path: path,
    attachment_file_name: fileName,
    attachment_mime_type: mimeType,
    attachment_size_bytes: sizeBytes,
  });

  if (error) {
    await supabase.storage.from(ATTACHMENT_BUCKET).remove([path]);
    throw error;
  }
}

/** original_body and edited_at are set automatically by
 * messages_track_edit (chat.sql) the first time body actually changes —
 * this just writes the new text. */
export async function editMessage(messageId: string, newBody: string): Promise<void> {
  const { error } = await supabase.from('messages').update({ body: newBody }).eq('id', messageId);
  if (error) throw error;
}

/** Always available, either side, no time limit — a per-viewer
 * suppression row, never touches the shared message. */
export async function deleteMessageForMe(messageId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('message_hidden_for')
    .upsert({ message_id: messageId, user_id: userId }, { onConflict: 'message_id,user_id' });
  if (error) throw error;
}

/** Sender-only, within 30 minutes of sending — enforced for real by
 * messages' own update policy (chat.sql), not just this check. This
 * actually clears the content (and cleans up the audio file), so a
 * "deleted for everyone" message is genuinely gone, not just hidden. */
export async function deleteMessageForEveryone(messageId: string): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from('messages')
    .select('audio_storage_path, attachment_storage_path')
    .eq('id', messageId)
    .single();
  if (fetchError) throw fetchError;

  const { error } = await supabase
    .from('messages')
    .update({
      deleted_for_everyone_at: new Date().toISOString(),
      body: null,
      audio_storage_path: null,
      attachment_storage_path: null,
      attachment_file_name: null,
      attachment_mime_type: null,
      attachment_size_bytes: null,
    })
    .eq('id', messageId);
  if (error) throw error;

  const audioPath = existing?.audio_storage_path as string | null;
  if (audioPath) {
    const { error: removeError } = await supabase.storage.from(AUDIO_BUCKET).remove([audioPath]);
    if (removeError) console.error('Failed to remove chat audio after delete-for-everyone:', removeError);
  }

  // A bulk-blasted attachment (path starts "bulk/...") is one shared
  // file referenced by every recipient's own message row — deleting
  // this one person's message must never remove it out from under
  // everyone else who was sent the same thing.
  const attachmentPath = existing?.attachment_storage_path as string | null;
  if (attachmentPath && !attachmentPath.startsWith('bulk/')) {
    const { error: removeError } = await supabase.storage.from(ATTACHMENT_BUCKET).remove([attachmentPath]);
    if (removeError) console.error('Failed to remove chat attachment after delete-for-everyone:', removeError);
  }
}

/** Client-side courtesy copy of the 30-minute rule the database
 * actually enforces — lets the UI hide "Delete for everyone" before
 * bothering to ask, not instead of the real check. */
export function canDeleteForEveryone(createdAt: string): boolean {
  const ageSeconds = (Date.now() - new Date(createdAt).getTime()) / 1000;
  return ageSeconds <= DELETE_FOR_EVERYONE_WINDOW_SECONDS;
}

/**
 * Fires on every insert or update (new message, edit, either kind of
 * delete, or the other party's read receipt moving) in this
 * conversation. Returns an unsubscribe function.
 *
 * Two independent callers subscribe to the same conversation at once —
 * the Chat tab's unread badge (see client/_layout.tsx) stays subscribed
 * the whole time the client is anywhere in the tab bar, while ChatThread
 * subscribes separately whenever the thread itself is open. Supabase's
 * real client throws ("cannot add postgres_changes callbacks... after
 * subscribe()") if two subscriptions share the exact same channel name
 * and one of them has already called subscribe() — the channel name is
 * purely a client-side handle, not what actually scopes which rows you
 * receive (the `filter` below does that), so giving each call its own
 * unique name costs nothing and avoids the collision entirely.
 */
export function subscribeToConversation(conversationId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`messages:${conversationId}:${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      onChange
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'conversation_reads', filter: `conversation_id=eq.${conversationId}` },
      onChange
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Marks everything currently in the conversation as read by this
 * person, right now — the same "opening it and seeing what's there
 * means you've read it" simplification every real messaging app makes,
 * rather than tracking which specific messages were actually looked
 * at. Upsert since "first time reading this conversation" and
 * "advancing the cursor again" are the same action.
 */
export async function markConversationRead(conversationId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('conversation_reads')
    .upsert(
      { conversation_id: conversationId, user_id: userId, last_read_at: new Date().toISOString() },
      { onConflict: 'conversation_id,user_id' }
    );
  if (error) throw error;
}

/**
 * How many messages the OTHER party sent that this viewer hasn't read
 * yet — the Chat tab badge's count. Reuses the exact same two data
 * sources listMessages() already reads (the message rows and this
 * viewer's message_hidden_for rows), filtered client-side rather than
 * as a single SQL count, so a message this viewer deleted-for-me is
 * correctly excluded from the badge the same way it's excluded from
 * the thread itself — a discrepancy there (badge says 3, opening Chat
 * shows 2) would be a real, visible bug, not just an internal detail.
 */
export async function getUnreadMessageCount(conversationId: string, viewerId: string): Promise<number> {
  const [readRes, messagesRes, hiddenRes] = await Promise.all([
    supabase
      .from('conversation_reads')
      .select('last_read_at')
      .eq('conversation_id', conversationId)
      .eq('user_id', viewerId)
      .maybeSingle(),
    supabase
      .from('messages')
      .select('id, created_at, deleted_for_everyone_at')
      .eq('conversation_id', conversationId)
      .neq('sender_id', viewerId),
    supabase.from('message_hidden_for').select('message_id').eq('user_id', viewerId),
  ]);

  if (readRes.error) throw readRes.error;
  if (messagesRes.error) throw messagesRes.error;
  if (hiddenRes.error) throw hiddenRes.error;

  const lastReadAt = readRes.data?.last_read_at as string | null | undefined;
  const hiddenIds = new Set((hiddenRes.data ?? []).map((row) => row.message_id as string));

  return (messagesRes.data ?? []).filter((row) => {
    if (hiddenIds.has(row.id as string)) return false;
    if (row.deleted_for_everyone_at) return false;
    return !lastReadAt || (row.created_at as string) > lastReadAt;
  }).length;
}

/** Both participants' read cursors for this conversation, keyed by
 * user id — a message counts as read by someone if their cursor here
 * is at or after that message's created_at. */
export async function getReadReceipts(conversationId: string): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('conversation_reads')
    .select('user_id, last_read_at')
    .eq('conversation_id', conversationId);
  if (error) throw error;

  const map: Record<string, string> = {};
  (data ?? []).forEach((row) => {
    map[row.user_id as string] = row.last_read_at as string;
  });
  return map;
}

/** Call while a chat screen is actually open — same "check while
 * active, no background job" shape as the weekly TDEE recalculation
 * check already uses. */
export async function updateLastSeen(userId: string): Promise<void> {
  const { error } = await supabase.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', userId);
  if (error) throw error;
}

export async function getLastSeen(userId: string): Promise<string | null> {
  const { data, error } = await supabase.from('profiles').select('last_seen_at').eq('id', userId).single();
  if (error) throw error;
  return data.last_seen_at as string | null;
}

export function isOnline(lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return false;
  return (Date.now() - new Date(lastSeenAt).getTime()) / 1000 <= ONLINE_THRESHOLD_SECONDS;
}

/** Single-coach app, so "the coach" a client talks to is whichever
 * coach account exists first — same simplification every other client
 * feature already makes (any coach can see any client, and vice versa
 * now). Used by the client's own Chat screen to know who it's showing
 * a name and presence for. */
export async function getAnyCoach(): Promise<{ id: string; name: string } | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('role', 'coach')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { id: data.id as string, name: (data.full_name as string | null) || (data.email as string).split('@')[0] };
}

export type CoachInboxEntry = {
  clientId: string;
  name: string;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  lastSeenAt: string | null;
};

/** One row per client, most recently messaged first — clients with no
 * conversation yet still show up (so the coach can start one), just
 * with no preview. One coach, a handful of clients — the same "cheap
 * to do all this after the list itself loads" scale assumption the
 * Clients list's compliance/tier fetches already make. */
export async function listCoachConversations(): Promise<CoachInboxEntry[]> {
  const { data: clients, error: clientsError } = await supabase
    .from('profiles')
    .select('id, full_name, email, last_seen_at')
    .eq('role', 'client');
  if (clientsError) throw clientsError;

  const { data: recentMessages, error: messagesError } = await supabase
    .from('messages')
    .select('conversation_id, body, kind, created_at, conversations!inner(client_id)')
    .order('created_at', { ascending: false })
    .limit(500);
  if (messagesError) throw messagesError;

  const latestByClient = new Map<string, { preview: string; at: string }>();
  (recentMessages ?? []).forEach((row) => {
    const clientId = (row.conversations as unknown as { client_id: string }).client_id;
    if (latestByClient.has(clientId)) return;
    const preview =
      row.kind === 'voice'
        ? '🎤 Voice message'
        : row.kind === 'image'
          ? '📷 Photo'
          : row.kind === 'file'
            ? '📎 Document'
            : ((row.body as string | null) ?? '(message deleted)');
    latestByClient.set(clientId, { preview, at: row.created_at as string });
  });

  return (clients ?? [])
    .map((client) => {
      const latest = latestByClient.get(client.id as string);
      return {
        clientId: client.id as string,
        name: (client.full_name as string | null) || (client.email as string).split('@')[0],
        lastMessagePreview: latest?.preview ?? null,
        lastMessageAt: latest?.at ?? null,
        lastSeenAt: client.last_seen_at as string | null,
      };
    })
    .sort((a, b) => {
      if (!a.lastMessageAt && !b.lastMessageAt) return a.name.localeCompare(b.name);
      if (!a.lastMessageAt) return 1;
      if (!b.lastMessageAt) return -1;
      return b.lastMessageAt.localeCompare(a.lastMessageAt);
    });
}
