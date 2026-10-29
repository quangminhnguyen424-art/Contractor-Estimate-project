import { Platform } from 'react-native';

import { getAI, type SampleFn } from '@/engine/ai';

/**
 * When the web version runs as a claude.ai artifact (in the Claude app or claude.ai), the page
 * gets `window.claude.use(...)`: Claude on the user's own Claude plan (no API key) and a
 * "save file" that opens the share sheet on iPhone. Everywhere else these resolve to null.
 */
type ClaudeHost = { use(name: string): Promise<unknown> };
type DownloadsNs = { save(req: { filename: string; data: string | Blob }): Promise<{ status: string }> };

function host(): ClaudeHost | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    const c = (window as unknown as { claude?: ClaudeHost }).claude;
    return c && typeof c.use === 'function' ? c : null;
  } catch {
    return null;
  }
}

/** True when running inside claude.ai / the Claude app. */
export const inClaudeApp = host() !== null;

const memo = new Map<string, Promise<unknown>>();
function capability<T>(name: string): Promise<T | null> {
  const c = host();
  if (!c) return Promise.resolve(null);
  if (!memo.has(name)) memo.set(name, c.use(name).catch(() => null));
  return memo.get(name) as Promise<T | null>;
}

export const hostSample = () => capability<SampleFn>('sample');

/** The AI to use here: Claude built into the Claude app, else your own API key, else the offline reader. */
export const aiFor = (apiKey?: string) => (inClaudeApp ? getAI({ host: hostSample }) : getAI({ apiKey }));

/**
 * Offers a file to save/share through the Claude app. Returns 'saved', 'declined' (user said no),
 * or 'unavailable' (not in the Claude app, so the caller should use its normal path).
 */
export async function hostSave(filename: string, data: string | Blob): Promise<'saved' | 'declined' | 'unavailable'> {
  const dl = await capability<DownloadsNs>('downloads');
  if (!dl) return 'unavailable';
  try {
    await dl.save({ filename, data });
    return 'saved';
  } catch (e) {
    const code = typeof e === 'object' && e && 'code' in e ? String((e as { code: unknown }).code) : '';
    if (code === 'declined' || code === 'rate_limited') return 'declined';
    return 'unavailable';
  }
}

/** A file name that is safe on every phone and computer. */
export const safeFileName = (s: string) => s.replace(/[\\/:*?"<>|#%]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'file';
