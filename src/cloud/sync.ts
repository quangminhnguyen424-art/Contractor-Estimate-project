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

/** Uploads photos the cloud doesn't have yet. Returns how many were sent. */
export async function backupPhotos(uid: string, d: Persisted, onProgress?: (done: number, total: number) => void): Promise<number> {
  let done: Set<string>;
  try {
    done = new Set(JSON.parse((await AsyncStorage.getItem(UPLOADED)) ?? '[]') as string[]);
  } catch {
    done = new Set();
  }
  const todo = photoUris(d).map((u) => ({ u, name: photoCloudName(u) })).filter((x): x is { u: string; name: string } => !!x.name && !done.has(`${uid}/${x.name}`));
  let sent = 0;
  for (const [i, x] of todo.entries()) {
    onProgress?.(i, todo.length);
    const bytes = await photoBytes(x.u);
    if (!bytes) continue;
    const { error } = await supabase.storage.from('photos').upload(`${uid}/${x.name}`, bytes, { contentType: 'image/jpeg', upsert: true });
    if (error) continue;
    done.add(`${uid}/${x.name}`);
    sent++;
    if (sent % 5 === 0) await AsyncStorage.setItem(UPLOADED, JSON.stringify([...done])).catch(() => {});
  }
  await AsyncStorage.setItem(UPLOADED, JSON.stringify([...done])).catch(() => {});
  return sent;
}

/** Downloads photos the data needs but this phone doesn't have (a new phone, or after a reinstall). */
export async function restorePhotos(uid: string, d: Persisted): Promise<number> {
  let got = 0;
  for (const u of photoUris(d)) {
    const name = photoCloudName(u);
    if (!name || (await hasPhoto(u))) continue;
    const { data, error } = await supabase.storage.from('photos').download(`${uid}/${name}`);
    if (error || !data) continue;
    await restorePhoto(u, new Uint8Array(await data.arrayBuffer()));
    got++;
  }
  return got;
}

/** Removes cloud copies of photos the contractor deleted. */
export async function deleteCloudPhotos(uid: string, uris: string[]) {
  const names = uris.map(photoCloudName).filter((n): n is string => !!n).map((n) => `${uid}/${n}`);
  if (names.length) await supabase.storage.from('photos').remove(names).catch(() => {});
}
