import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { safeFileName } from './host';

/** A safe file name that keeps its extension even when the title is long. */
export function fileName(name: string) {
  const ext = /\.[a-z0-9]{1,5}$/i.exec(name)?.[0] ?? '';
  return `${safeFileName(name.slice(0, name.length - ext.length)).slice(0, 60)}${ext}`;
}

/** Shares a small text file (for example a calendar invite) through the phone's share sheet. */
export async function shareTextFile(name: string, text: string, mimeType: string, uti?: string): Promise<boolean> {
  const f = new File(Paths.cache, fileName(name));
  if (f.exists) f.delete();
  f.create();
  await f.write(text);
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(f.uri, { mimeType, ...(uti ? { UTI: uti } : {}) });
  return true;
}
