import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { newId } from '@/engine/format';

/**
 * Job site photos on the phone: shrunk to a sensible size and kept in the app's own folder (photos straight
 * from the camera live in a temporary cache). Saved data stores only "app-photo:<file name>", because iOS can
 * move the app's folder when the app is updated; the full path is rebuilt every time a photo is used.
 */
const DIR = 'site-photos';
const PREFIX = 'app-photo:';

async function shrink(uri: string, width: number, base64: boolean, compress: number) {
  const ctx = ImageManipulator.manipulate(uri);
  let ref: Awaited<ReturnType<typeof ctx.renderAsync>> | null = null;
  try {
    ctx.resize({ width });
    ref = await ctx.renderAsync();
    return await ref.saveAsync({ base64, compress, format: SaveFormat.JPEG });
  } finally {
    try { ref?.release(); } catch { /* released */ }
    try { ctx.release(); } catch { /* released */ }
  }
}

/** The real file path for a stored photo (also repairs full paths saved by older versions). */
export function resolvePhotoUri(uri: string): string {
  if (uri.startsWith(PREFIX)) return new File(Paths.document, DIR, uri.slice(PREFIX.length)).uri;
  const m = /\/site-photos\/([^/?#]+)$/.exec(uri);
  if (m) return new File(Paths.document, DIR, m[1]).uri;
  return uri;
}

/** For <Image>: the photo's displayable address. */
export function usePhotoUri(uri: string): string {
  return resolvePhotoUri(uri);
}

/** An address image tools can read (for Claude and resizing). */
export async function readablePhotoUri(uri: string): Promise<string | null> {
  return resolvePhotoUri(uri);
}

export async function savePhoto(uri: string, srcWidth?: number): Promise<{ uri: string; w: number; h: number }> {
  const out = await shrink(uri, Math.min(srcWidth || 1600, 1600), false, 0.8);
  const dir = new Directory(Paths.document, DIR);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const name = `${newId()}.jpg`;
  // Move (not copy) so the resized temporary file doesn't linger in the cache.
  await new File(out.uri).move(new File(dir, name));
  return { uri: `${PREFIX}${name}`, w: out.width, h: out.height };
}

/** An embeddable copy for PDFs (data: URL), smaller than the original. */
export async function photoDataUrl(uri: string): Promise<string | null> {
  try {
    const out = await shrink(resolvePhotoUri(uri), 1100, true, 0.7);
    return out.base64 ? `data:image/jpeg;base64,${out.base64}` : null;
  } catch {
    return null;
  }
}

export function deletePhotoFile(uri: string) {
  try {
    const f = new File(resolvePhotoUri(uri));
    if (f.exists) f.delete();
  } catch {
    // already gone
  }
}
