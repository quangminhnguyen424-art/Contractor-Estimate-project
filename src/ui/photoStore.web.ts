import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useEffect, useState } from 'react';

import { newId } from '@/engine/format';

/**
 * In the browser version, photos live in the browser's photo database (IndexedDB), not inside the app's saved
 * data: that store is small, and a few dozen photos would fill it so nothing else could be saved. Saved data
 * keeps only "idb:<id>". If the database is unavailable, a small copy is kept inline as before.
 */
const DB = 'estimator-photos';
const STORE = 'photos';
const cache = new Map<string, string>();

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function shrink(uri: string, width: number, compress: number) {
  const ctx = ImageManipulator.manipulate(uri);
  let ref: Awaited<ReturnType<typeof ctx.renderAsync>> | null = null;
  try {
    ctx.resize({ width });
    ref = await ctx.renderAsync();
    return await ref.saveAsync({ base64: true, compress, format: SaveFormat.JPEG });
  } finally {
    try { ref?.release(); } catch { /* released */ }
    try { ctx.release(); } catch { /* released */ }
  }
}

async function load(uri: string): Promise<string | null> {
  if (uri.startsWith('data:')) return uri;
  if (!uri.startsWith('idb:')) return null;
  const hit = cache.get(uri);
  if (hit) return hit;
  try {
    const v = await tx<string | undefined>('readonly', (s) => s.get(uri.slice(4)) as IDBRequest<string | undefined>);
    if (v) cache.set(uri, v);
    return v ?? null;
  } catch {
    return null;
  }
}

export function resolvePhotoUri(uri: string): string {
  return uri.startsWith('idb:') ? cache.get(uri) ?? '' : uri;
}

/** For <Image>: loads the photo from the browser's photo database. */
export function usePhotoUri(uri: string): string {
  const [loaded, setLoaded] = useState<{ uri: string; src: string } | null>(null);
  const known = resolvePhotoUri(uri);
  useEffect(() => {
    if (resolvePhotoUri(uri)) return;
    let live = true;
    load(uri).then((v) => { if (live && v) setLoaded({ uri, src: v }); });
    return () => { live = false; };
  }, [uri]);
  return known || (loaded?.uri === uri ? loaded.src : '');
}

export async function readablePhotoUri(uri: string): Promise<string | null> {
  return load(uri);
}

export async function savePhoto(uri: string, srcWidth?: number): Promise<{ uri: string; w: number; h: number }> {
  try {
    const out = await shrink(uri, Math.min(srcWidth || 1400, 1400), 0.75);
    if (!out.base64) throw new Error('no data');
    const id = newId();
    const data = `data:image/jpeg;base64,${out.base64}`;
    await tx('readwrite', (s) => s.put(data, id));
    cache.set(`idb:${id}`, data);
    return { uri: `idb:${id}`, w: out.width, h: out.height };
  } catch {
    // No photo database (private window, blocked storage): keep a small copy inline.
    const out = await shrink(uri, Math.min(srcWidth || 700, 700), 0.55);
    if (!out.base64) throw new Error('Could not read the photo.');
    return { uri: `data:image/jpeg;base64,${out.base64}`, w: out.width, h: out.height };
  }
}

export async function photoDataUrl(uri: string): Promise<string | null> {
  return load(uri);
}

export function deletePhotoFile(uri: string) {
  if (!uri.startsWith('idb:')) return;
  cache.delete(uri);
  tx('readwrite', (s) => s.delete(uri.slice(4))).catch(() => {});
}

// ---- Cloud backup ----

export function photoCloudName(uri: string): string | null {
  return uri.startsWith('idb:') ? `${uri.slice(4)}.jpg` : null;
}

export async function hasPhoto(uri: string): Promise<boolean> {
  return !uri.startsWith('idb:') || (await load(uri)) != null;
}

export async function photoBytes(uri: string): Promise<Uint8Array | null> {
  const data = await load(uri);
  if (!data) return null;
  const bin = atob(data.slice(data.indexOf(',') + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function restorePhoto(uri: string, bytes: Uint8Array): Promise<void> {
  if (!uri.startsWith('idb:')) return;
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const data = `data:image/jpeg;base64,${btoa(s)}`;
  await tx('readwrite', (st) => st.put(data, uri.slice(4)));
  cache.set(uri, data);
}
