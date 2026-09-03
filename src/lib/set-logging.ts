import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@/lib/supabase';

export type SetLogValues = {
  weight: number | null;
  reps: number | null;
  rpe: number | null;
};

type CachedSetEntry = SetLogValues & {
  /** False the instant a set is saved locally; flips true only once the
   * background push to Supabase has actually confirmed it. */
  synced: boolean;
  /** True when this entry represents an unchecked (removed) set that
   * still needs its delete pushed to the server. */
  deleted: boolean;
};

type LocalCache = Record<string, CachedSetEntry>;

function setLogKey(exerciseId: string, setNumber: number): string {
  return `${exerciseId}:${setNumber}`;
}

function storageKey(assignmentId: string): string {
  return `primal-physique/set-logs/${assignmentId}`;
}

async function loadLocalCache(assignmentId: string): Promise<LocalCache> {
  const raw = await AsyncStorage.getItem(storageKey(assignmentId));
  if (!raw) return {};
  try {
    return JSON.parse(raw) as LocalCache;
  } catch {
    // A corrupted cache entry is treated as empty rather than thrown --
    // losing a locally-cached value is recoverable (the server fetch
    // still has whatever was already confirmed); crashing the session
    // screen over it is not.
    return {};
  }
}

async function persistLocalCache(assignmentId: string, cache: LocalCache): Promise<void> {
  await AsyncStorage.setItem(storageKey(assignmentId), JSON.stringify(cache));
}

/** Every set already confirmed on the server for this assignment, keyed
 * the same way the local cache is. */
export async function listSetLogsForAssignment(assignmentId: string): Promise<Record<string, SetLogValues>> {
  const { data, error } = await supabase
    .from('workout_logs')
    .select('exercise_id, set_number, weight, reps, rpe')
    .eq('assignment_id', assignmentId)
    .not('set_number', 'is', null);

  if (error) throw error;

  const result: Record<string, SetLogValues> = {};
  (data ?? []).forEach((row) => {
    result[setLogKey(row.exercise_id as string, row.set_number as number)] = {
      weight: row.weight as number | null,
      reps: row.reps as number | null,
      rpe: row.rpe as number | null,
    };
  });
  return result;
}

async function upsertSetLogRemote(
  assignmentId: string,
  clientId: string,
  exerciseId: string,
  setNumber: number,
  values: SetLogValues
) {
  const { error } = await supabase.from('workout_logs').upsert(
    {
      assignment_id: assignmentId,
      client_id: clientId,
      exercise_id: exerciseId,
      set_number: setNumber,
      weight: values.weight,
      reps: values.reps,
      rpe: values.rpe,
    },
    { onConflict: 'assignment_id,exercise_id,set_number' }
  );
  if (error) throw error;
}

async function deleteSetLogRemote(assignmentId: string, exerciseId: string, setNumber: number) {
  const { error } = await supabase
    .from('workout_logs')
    .delete()
    .eq('assignment_id', assignmentId)
    .eq('exercise_id', exerciseId)
    .eq('set_number', setNumber);
  if (error) throw error;
}

/**
 * The one function the UI calls when a set is checked complete (or an
 * already-checked set's weight/reps/RPE is edited). The local write
 * below is `await`ed and is the only thing the caller needs to wait on
 * -- it's a plain device-storage write, so it can't fail because of the
 * network. The Supabase push after it is attempted, but never allowed to
 * make this function throw: a failed push just leaves the entry queued
 * (`synced: false`) for the next flush, exactly as if it had never been
 * attempted.
 */
export async function saveSetLog(
  assignmentId: string,
  clientId: string,
  exerciseId: string,
  setNumber: number,
  values: SetLogValues
): Promise<void> {
  const cache = await loadLocalCache(assignmentId);
  const key = setLogKey(exerciseId, setNumber);
  cache[key] = { ...values, synced: false, deleted: false };
  await persistLocalCache(assignmentId, cache);

  try {
    await upsertSetLogRemote(assignmentId, clientId, exerciseId, setNumber, values);
    const latest = await loadLocalCache(assignmentId);
    if (latest[key] && !latest[key].deleted) {
      latest[key] = { ...latest[key], synced: true };
      await persistLocalCache(assignmentId, latest);
    }
  } catch (err) {
    // Deliberately swallowed -- this is exactly the "network write
    // failed at that moment" case the local cache exists for. The entry
    // is already durably saved on-device with synced: false; the next
    // flush (next set checked, next screen load, or the periodic sweep)
    // will retry it. Logged, not surfaced, so it never interrupts the
    // set the client is mid-way through.
    console.error('Failed to sync set log, will retry:', err);
  }
}

/** Mirrors saveSetLog for unchecking a set: the local removal is
 * immediate and durable, the server delete is attempted the same
 * best-effort way. */
export async function deleteSetLog(assignmentId: string, exerciseId: string, setNumber: number): Promise<void> {
  const cache = await loadLocalCache(assignmentId);
  const key = setLogKey(exerciseId, setNumber);
  delete cache[key];
  await persistLocalCache(assignmentId, cache);

  try {
    await deleteSetLogRemote(assignmentId, exerciseId, setNumber);
  } catch (err) {
    // Queue the delete itself so a flush can retry it -- otherwise an
    // offline "uncheck" would silently fail to ever remove the row
    // server-side once connectivity returns.
    const latest = await loadLocalCache(assignmentId);
    latest[key] = { weight: null, reps: null, rpe: null, synced: false, deleted: true };
    await persistLocalCache(assignmentId, latest);
    console.error('Failed to sync set deletion, will retry:', err);
  }
}

let flushInFlight = false;

/**
 * Retries every not-yet-confirmed local entry for this assignment --
 * called on screen load, on every subsequent set-check (a natural
 * "try again" trigger already happening), and on a quiet timer while the
 * screen is open. A single in-memory guard stops overlapping sweeps from
 * racing each other; if one's already running, this call is a no-op and
 * the next trigger picks up whatever's still unsynced.
 */
export async function flushPendingSetLogs(assignmentId: string, clientId: string): Promise<void> {
  if (flushInFlight) return;
  flushInFlight = true;
  try {
    const cache = await loadLocalCache(assignmentId);
    for (const [key, entry] of Object.entries(cache)) {
      if (entry.synced) continue;
      const [exerciseId, setNumberStr] = key.split(':');
      const setNumber = Number(setNumberStr);

      try {
        if (entry.deleted) {
          await deleteSetLogRemote(assignmentId, exerciseId, setNumber);
          const latest = await loadLocalCache(assignmentId);
          delete latest[key];
          await persistLocalCache(assignmentId, latest);
        } else {
          await upsertSetLogRemote(assignmentId, clientId, exerciseId, setNumber, entry);
          const latest = await loadLocalCache(assignmentId);
          if (latest[key]) {
            latest[key] = { ...latest[key], synced: true };
            await persistLocalCache(assignmentId, latest);
          }
        }
      } catch (err) {
        // Still offline (or still failing) -- leave it queued and move
        // on to the next entry rather than aborting the whole sweep.
        console.error('Flush retry failed for', key, err);
      }
    }
  } finally {
    flushInFlight = false;
  }
}

/**
 * The merged view a session screen actually renders from: server-
 * confirmed values, overridden by anything still sitting locally
 * unsynced -- the local value always wins, since it reflects the most
 * recent thing the client actually did, which the server may not know
 * about yet.
 */
export async function getMergedSetLogs(assignmentId: string): Promise<Record<string, SetLogValues>> {
  const [serverLogs, cache] = await Promise.all([listSetLogsForAssignment(assignmentId), loadLocalCache(assignmentId)]);

  const merged: Record<string, SetLogValues> = { ...serverLogs };
  for (const [key, entry] of Object.entries(cache)) {
    if (entry.deleted) {
      delete merged[key];
      continue;
    }
    merged[key] = { weight: entry.weight, reps: entry.reps, rpe: entry.rpe };
  }
  return merged;
}

/** Best-effort cleanup once a session is finished and everything's
 * confirmed synced -- not required for correctness (a leftover cache
 * entry for a completed assignment is harmless), just tidiness. */
export async function clearLocalSetLogsIfFullySynced(assignmentId: string): Promise<void> {
  const cache = await loadLocalCache(assignmentId);
  const stillPending = Object.values(cache).some((entry) => !entry.synced);
  if (!stillPending) {
    await AsyncStorage.removeItem(storageKey(assignmentId));
  }
}

export { setLogKey };
