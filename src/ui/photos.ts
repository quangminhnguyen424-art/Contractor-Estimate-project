import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { ImageInput } from '@/engine/ai';

/** Shrinks one job photo and returns it as base64 JPEG for Claude (keeps cost and upload time low). */
export async function toAiImage(uri: string): Promise<ImageInput | null> {
  let ctx: ReturnType<typeof ImageManipulator.manipulate>;
  try {
    ctx = ImageManipulator.manipulate(uri);
  } catch {
    return null;
  }
  let ref: Awaited<ReturnType<typeof ctx.renderAsync>> | null = null;
  try {
    ctx.resize({ width: 1280 });
    ref = await ctx.renderAsync();
    const out = await ref.saveAsync({ base64: true, compress: 0.7, format: SaveFormat.JPEG });
    return out.base64 ? { mediaType: 'image/jpeg', base64: out.base64 } : null;
  } catch {
    return null;
  } finally {
    // Free the full-size image right away; phones run out of memory with several 12 MP photos.
    try { ref?.release(); } catch { /* already released */ }
    try { ctx.release(); } catch { /* already released */ }
  }
}

/** Converts photos one at a time (never all at once) and reports how many could not be used. */
export async function toAiImages(uris: string[], max = 8): Promise<{ images: ImageInput[]; failed: number }> {
  const images: ImageInput[] = [];
  let failed = 0;
  for (const [i, uri] of uris.slice(0, max).entries()) {
    const img = await toAiImage(uri);
    // Labeled by its place among the contractor's photos, so "Photo 3" always means the third photo.
    if (img) images.push({ ...img, label: `Photo ${i + 1}` });
    else failed++;
  }
  return { images, failed };
}
