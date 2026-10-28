import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { ImageInput } from '@/engine/ai';

/** Shrinks a job photo and returns it as base64 JPEG for Claude (keeps cost and upload time low). */
export async function toAiImage(uri: string): Promise<ImageInput | null> {
  try {
    const ctx = ImageManipulator.manipulate(uri);
    ctx.resize({ width: 1280 });
    const ref = await ctx.renderAsync();
    const out = await ref.saveAsync({ base64: true, compress: 0.7, format: SaveFormat.JPEG });
    return out.base64 ? { mediaType: 'image/jpeg', base64: out.base64 } : null;
  } catch {
    return null;
  }
}
