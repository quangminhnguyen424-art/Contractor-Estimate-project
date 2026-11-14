// Keeps the phone and Bidwell cloud in step: the whole workspace as one row, photos as private files.
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Persisted } from '@/store/sanitize';
import { hasPhoto, photoBytes, photoCloudName, restorePhoto } from '@/ui/photoStore';

import { supabase } from './client';
import type { SyncMeta } from './decide';

export { decide } from './decide';
export type { SyncMeta };

const META = 'estimating-app/cloud-meta';
const UPLOADED = 'estimating-app/cloud-photos';


export async function loadMeta(): Promise<SyncMeta | null> {
  try {
    const raw = await AsyncStorage.getItem(META);
    return raw ? (JSON.parse(raw) as SyncMeta) : null;
  } catch {
    return null;
  }
}
export const clearMeta = () => AsyncStorage.removeItem(META).catch(() => {});
export const saveMeta = (m: SyncMeta) => AsyncStorage.setItem(META, JSON.stringify(m)).catch(() => {});

/** When the cloud copy last changed, without downloading it. Null: this account has nothing in the cloud yet. */
export async function workspaceStamp(uid: string): Promise<{ updatedAt: string } | null> {
  const { data, error } = await supabase.from('workspaces').select('updated_at').eq('user_id', uid).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { updatedAt: data.updated_at as string } : null;
}

export async function pullWorkspace(uid: string): Promise<{ data: unknown; updatedAt: string } | null> {
  const { data, error } = await supabase.from('workspaces').select('data, updated_at').eq('user_id', uid).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { data: data.data, updatedAt: data.updated_at as string } : null;
}

export async function pushWorkspace(uid: string, data: Persisted, device: string): Promise<string> {
  const updated_at = new Date().toISOString();
  const { error } = await supabase.from('workspaces').upsert({ user_id: uid, data, updated_at, device });
  if (error) throw new Error(error.message);
  return updated_at;
}

/** Every photo the saved data points to (job sites and receipts). */
export function photoUris(d: Persisted): string[] {
  const out = new Set<string>();
  for (const p of d.projects) {
    for (const r of p.rooms) for (const ph of r.photos) out.add(ph.uri);
    for (const c of p.money?.costs ?? []) if (c.receiptUri) out.add(c.receiptUri);
  }
  for (const e of d.estimates) for (const u of e.photos) out.add(u);
  return [...out];
}

let backingUp = false;
let restoring = false;

/** A photo that came down from storage, as bytes. React Native's Blob has no arrayBuffer(), so read it the way it can. */
function blobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof (blob as { arrayBuffer?: unknown }).arrayBuffer === 'function') return blob.arrayBuffer().then((b) => new Uint8Array(b));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the photo.'));
    reader.readAsArrayBuffer(blob);
  });
}

/** Uploads photos the cloud doesn't have yet, one run at a time. Says how many were sent and how many could not be. */
export async function backupPhotos(uid: string, d: Persisted, onProgress?: (done: number, total: number) => void): Promise<{ sent: number; failed: number }> {
  if (backingUp) return { sent: 0, failed: 0 };
  backingUp = true;
  try { return await backupPhotosNow(uid, d, onProgress); } finally { backingUp = false; }
}

async function backupPhotosNow(uid: string, d: Persisted, onProgress?: (done: number, total: number) => void): Promise<{ sent: number; failed: number }> {
  let done: Set<string>;
  try {
    done = new Set(JSON.parse((await AsyncStorage.getItem(UPLOADED)) ?? '[]') as string[]);
  } catch {
    done = new Set();
  }
  const todo = photoUris(d).map((u) => ({ u, name: photoCloudName(u) })).filter((x): x is { u: string; name: string } => !!x.name && !done.has(`${uid}/${x.name}`));
  let sent = 0;
  let failed = 0;
  for (const [i, x] of todo.entries()) {
    onProgress?.(i, todo.length);
    const bytes = await photoBytes(x.u);
    if (!bytes) continue; // the file is not on this phone (it lives on another one)
    const { error } = await supabase.storage.from('photos').upload(`${uid}/${x.name}`, bytes, { contentType: 'image/jpeg', upsert: true }).catch((e: unknown) => ({ error: e }));
    if (error) { failed++; continue; }
    done.add(`${uid}/${x.name}`);
    sent++;
    if (sent % 5 === 0) await AsyncStorage.setItem(UPLOADED, JSON.stringify([...done])).catch(() => {});
  }
  await AsyncStorage.setItem(UPLOADED, JSON.stringify([...done])).catch(() => {});
  return { sent, failed };
}

/** Downloads photos the data needs but this phone doesn't have (a new phone, or after a reinstall). */
export async function restorePhotos(uid: string, d: Persisted): Promise<number> {
  if (restoring) return 0;
  restoring = true;
  let got = 0;
  try {
    for (const u of photoUris(d)) {
      const name = photoCloudName(u);
      if (!name || (await hasPhoto(u))) continue;
      try {
        const { data, error } = await supabase.storage.from('photos').download(`${uid}/${name}`);
        if (error || !data) continue;
        await restorePhoto(u, await blobBytes(data));
        got++;
      } catch { /* this one next time: restore runs again after every sync */ }
    }
  } finally {
    restoring = false;
  }
  return got;
}

/** Removes cloud copies of photos the contractor deleted. */
export async function deleteCloudPhotos(uid: string, uris: string[]) {
  const names = uris.map(photoCloudName).filter((n): n is string => !!n).map((n) => `${uid}/${n}`);
  if (names.length) await supabase.storage.from('photos').remove(names).catch(() => {});
}
