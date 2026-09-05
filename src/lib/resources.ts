import { decode } from 'base64-arraybuffer';

import { supabase } from '@/lib/supabase';

const BUCKET = 'resource-files';
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60;

export type ResourceType = 'file' | 'link';

export type ResourceFolder = {
  id: string;
  name: string;
};

export type ResourceItem = {
  id: string;
  folderId: string | null;
  name: string;
  type: ResourceType;
  /** For a link, the URL as entered. For a file, a freshly signed URL
   * good for an hour — never a bare storage path, since the bucket is
   * private. */
  url: string;
  fileName: string | null;
  mimeType: string | null;
  openToAll: boolean;
};

export type ResourceSection = {
  /** Null for the "Uncategorized" bucket — items with no folder_id. */
  folder: ResourceFolder | null;
  items: ResourceItem[];
};

type ResourceItemRow = {
  id: string;
  folder_id: string | null;
  name: string;
  type: ResourceType;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  url: string | null;
  open_to_all: boolean;
};

/** Turns a flat folder list + flat item list into folder-grouped
 * sections, "Uncategorized" last, each item's file-type url already
 * resolved to a signed URL. Shared by both the coach's (sees every own
 * item) and the client's (RLS already filtered to eligible-only) list
 * functions below — grouping/signing is identical either way, only the
 * underlying query differs. */
async function toSections(folders: ResourceFolder[], rows: ResourceItemRow[]): Promise<ResourceSection[]> {
  const filePaths = rows.map((r) => r.storage_path).filter((p): p is string => p !== null);
  const signedUrlByPath = new Map<string, string>();
  if (filePaths.length > 0) {
    const { data: signedUrls, error } = await supabase.storage.from(BUCKET).createSignedUrls(filePaths, SIGNED_URL_EXPIRY_SECONDS);
    if (error) throw error;
    (signedUrls ?? []).forEach((entry) => {
      if (entry.path && entry.signedUrl) signedUrlByPath.set(entry.path, entry.signedUrl);
    });
  }

  const items: ResourceItem[] = rows.map((row) => ({
    id: row.id,
    folderId: row.folder_id,
    name: row.name,
    type: row.type,
    url: row.type === 'file' ? (signedUrlByPath.get(row.storage_path as string) ?? '') : (row.url as string),
    fileName: row.file_name,
    mimeType: row.mime_type,
    openToAll: row.open_to_all,
  }));

  const sections: ResourceSection[] = folders
    .map((folder) => ({ folder, items: items.filter((item) => item.folderId === folder.id) }))
    .filter((section) => section.items.length > 0);

  const uncategorized = items.filter((item) => item.folderId === null);
  if (uncategorized.length > 0) sections.push({ folder: null, items: uncategorized });

  return sections;
}

/** Every folder this coach has created, alphabetically — used both by
 * the management screen and the "pick a folder" chip row on the create
 * screen. */
export async function listResourceFolders(coachId: string): Promise<ResourceFolder[]> {
  const { data, error } = await supabase.from('resource_folders').select('id, name').eq('coach_id', coachId).order('name');
  if (error) throw error;
  return (data ?? []).map((row) => ({ id: row.id as string, name: row.name as string }));
}

export async function createResourceFolder(coachId: string, name: string): Promise<ResourceFolder> {
  const { data, error } = await supabase
    .from('resource_folders')
    .insert({ coach_id: coachId, name })
    .select('id, name')
    .single();
  if (error) throw error;
  return { id: data.id as string, name: data.name as string };
}

/** The coach's own management view — every item they've created,
 * regardless of its audience (open_to_all doesn't scope what THEY can
 * see, only what a client can). */
export async function listCoachResourceLibrary(coachId: string): Promise<ResourceSection[]> {
  const [foldersRes, itemsRes] = await Promise.all([
    supabase.from('resource_folders').select('id, name').eq('coach_id', coachId).order('name'),
    supabase
      .from('resource_items')
      .select('id, folder_id, name, type, storage_path, file_name, mime_type, url, open_to_all')
      .eq('coach_id', coachId)
      .order('name'),
  ]);
  if (foldersRes.error) throw foldersRes.error;
  if (itemsRes.error) throw itemsRes.error;

  const folders = (foldersRes.data ?? []).map((row) => ({ id: row.id as string, name: row.name as string }));
  return toSections(folders, (itemsRes.data ?? []) as unknown as ResourceItemRow[]);
}

/**
 * A client's own view. No coach id to pass — same reasoning
 * listClientChallenges() already follows: there's only ever one coach
 * account in this app, so resource_items' own RLS (via
 * is_eligible_for_resource_item()) already scopes the item list down to
 * open-to-all items plus anything they're specifically listed for,
 * without needing to know whose library it is. Folders are read
 * separately (any client can see every folder NAME — see resources.sql
 * for why that's fine) and toSections() drops any folder that comes up
 * with zero visible items for this viewer.
 */
export async function listClientResourceLibrary(): Promise<ResourceSection[]> {
  const [foldersRes, itemsRes] = await Promise.all([
    supabase.from('resource_folders').select('id, name').order('name'),
    supabase
      .from('resource_items')
      .select('id, folder_id, name, type, storage_path, file_name, mime_type, url, open_to_all')
      .order('name'),
  ]);
  if (foldersRes.error) throw foldersRes.error;
  if (itemsRes.error) throw itemsRes.error;

  const folders = (foldersRes.data ?? []).map((row) => ({ id: row.id as string, name: row.name as string }));
  return toSections(folders, (itemsRes.data ?? []) as unknown as ResourceItemRow[]);
}

async function insertEligibility(itemId: string, eligibleClientIds: string[]): Promise<void> {
  if (eligibleClientIds.length === 0) return;
  const { error } = await supabase
    .from('resource_eligible_clients')
    .insert(eligibleClientIds.map((clientId) => ({ resource_item_id: itemId, client_id: clientId })));
  if (error) throw error;
}

export async function createResourceLink(params: {
  coachId: string;
  name: string;
  folderId: string | null;
  url: string;
  openToAll: boolean;
  eligibleClientIds: string[];
}): Promise<void> {
  const { coachId, name, folderId, url, openToAll, eligibleClientIds } = params;
  const { data, error } = await supabase
    .from('resource_items')
    .insert({ coach_id: coachId, folder_id: folderId, name, type: 'link', url, open_to_all: openToAll })
    .select('id')
    .single();
  if (error) throw error;

  if (!openToAll) await insertEligibility(data.id as string, eligibleClientIds);
}

/**
 * Uploads the picked file (base64, same convention chat.ts's
 * sendFileMessage()/sendImageMessage() already use — React Native's
 * Blob/File/FormData upload path doesn't work reliably against Supabase
 * Storage) and inserts its row. Rolls the upload back if the insert
 * fails, same as chat.ts.
 */
export async function uploadResourceFile(params: {
  coachId: string;
  name: string;
  folderId: string | null;
  base64: string;
  fileName: string;
  mimeType: string;
  openToAll: boolean;
  eligibleClientIds: string[];
}): Promise<void> {
  const { coachId, name, folderId, base64, fileName, mimeType, openToAll, eligibleClientIds } = params;
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${coachId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, decode(base64), { contentType: mimeType });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('resource_items')
    .insert({
      coach_id: coachId,
      folder_id: folderId,
      name,
      type: 'file',
      storage_path: path,
      file_name: fileName,
      mime_type: mimeType,
      open_to_all: openToAll,
    })
    .select('id')
    .single();

  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw error;
  }

  if (!openToAll) await insertEligibility(data.id as string, eligibleClientIds);
}

export async function deleteResourceItem(itemId: string): Promise<void> {
  const { data, error } = await supabase.from('resource_items').delete().eq('id', itemId).select('storage_path').single();
  if (error) throw error;

  const storagePath = data?.storage_path as string | null;
  if (storagePath) {
    const { error: removeError } = await supabase.storage.from(BUCKET).remove([storagePath]);
    if (removeError) console.error('Failed to remove resource file after delete:', removeError);
  }
}
