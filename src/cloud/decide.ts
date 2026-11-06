/** What this phone last agreed with the cloud: whose data, the cloud copy's time, and the local change it matched. */
export interface SyncMeta { uid: string; remoteAt: string; syncedChange: number }

/**
 * Decides what to do when the phone and the cloud may both have changed.
 * - nothing in the cloud: send the phone's data (if any)
 * - nothing on the phone, or the phone holds another account's data: take the cloud copy
 * - first sync on this phone: the newer side wins
 * - only one side changed since the last sync: that side wins; both changed: the most recent change wins
 */
export function decide(input: { uid: string; meta: SyncMeta | null; remote: { updatedAt: string } | null; localChange: number; localEmpty: boolean }): 'pull' | 'push' | 'none' {
  const { uid, meta, remote, localChange, localEmpty } = input;
  // Never send one account's data into another account's empty cloud.
  if (!remote) return localEmpty || (meta && meta.uid !== uid) ? 'none' : 'push';
  if (localEmpty || (meta && meta.uid !== uid)) return 'pull';
  if (!meta) return Date.parse(remote.updatedAt) > localChange ? 'pull' : 'push';
  const cloudChanged = remote.updatedAt > meta.remoteAt;
  const phoneChanged = localChange > meta.syncedChange;
  if (cloudChanged && phoneChanged) return Date.parse(remote.updatedAt) > localChange ? 'pull' : 'push';
  if (cloudChanged) return 'pull';
  if (phoneChanged) return 'push';
  return 'none';
}

