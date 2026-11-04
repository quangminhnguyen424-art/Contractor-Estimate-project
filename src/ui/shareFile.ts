import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { safeFileName } from './host';

/** Shares a small text file (for example a calendar invite) through the phone's share sheet. */
export async function shareTextFile(name: string, text: string, mimeType: string, uti?: string): Promise<boolean> {
  const f = new File(Paths.cache, safeFileName(name));
  if (f.exists) f.delete();
  f.create();
  f.write(text);
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(f.uri, { mimeType, ...(uti ? { UTI: uti } : {}) });
  return true;
}
