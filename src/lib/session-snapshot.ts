import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * A belt-and-braces safety net layered ON TOP of set-logging.ts's
 * per-set local cache, not a replacement for it. That system only ever
 * saves a set the instant it's checked complete -- a weight typed into a
 * box that hasn't been checked yet was never captured anywhere. This
 * fills that specific gap: every 10 minutes while a session is open, it
 * snapshots exactly what's currently on screen (every set's typed
 * values, checked or not, plus the session-level RPE if started) to its
 * own spot in on-device storage, independent of any check action.
 *
 * It also gives the per-set sync path an extra, less frequent chance to
 * retry anything still unconfirmed -- the caller triggers
 * flushPendingSetLogs() on the same 10-minute tick this module's
 * snapshot fires on, so a silently-stuck sync gets another shot at it
 * beyond set-logging.ts's own 20-second retry loop.
 */
export type SessionSnapshot = {
  setRows: Record<string, { weight: string; reps: string; rpe: number | null }>;
  sessionRpe: number | null;
  savedAt: string;
};

function storageKey(assignmentId: string): string {
  return `primal-physique/session-snapshot/${assignmentId}`;
}

export async function saveSessionSnapshot(assignmentId: string, snapshot: SessionSnapshot): Promise<void> {
  await AsyncStorage.setItem(storageKey(assignmentId), JSON.stringify(snapshot));
}

export async function loadSessionSnapshot(assignmentId: string): Promise<SessionSnapshot | null> {
  const raw = await AsyncStorage.getItem(storageKey(assignmentId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionSnapshot;
  } catch {
    // A corrupted snapshot is treated as if none existed -- it's a
    // best-effort restore on top of data that's already safely
    // elsewhere (server + per-set cache for anything checked), never
    // the only copy of anything.
    return null;
  }
}

/** Called once a session is actually finished -- there's nothing left
 * for this snapshot to protect once every set is either checked (and
 * therefore in the per-set cache/server) or was never going to be. */
export async function clearSessionSnapshot(assignmentId: string): Promise<void> {
  await AsyncStorage.removeItem(storageKey(assignmentId));
}
