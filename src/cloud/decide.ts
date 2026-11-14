/** What this phone last agreed with the cloud: whose data, the cloud copy's time, and the local change it matched. */
export interface SyncMeta { uid: string; remoteAt: string; syncedChange: number }

/**
 * Decides what to do when the phone and the cloud may both have changed.
 * - the phone holds another account's data: never send it; take this account's cloud copy, or clear the phone
 * - nothing in the cloud: send the phone's data (if any)
 * - nothing on the phone, or this phone has never synced: take the cloud copy. A phone that never synced holds
 *   at most a fresh setup, and that must not replace the account's saved work.
 * - only one side changed since the last sync: that side wins; both changed: the most recent change wins
 */
export function decide(input: { uid: string; meta: SyncMeta | null; remote: { updatedAt: string } | null; localChange: number; localEmpty: boolean }): 'pull' | 'push' | 'wipe' | 'none' {
  const { uid, meta, remote, localChange, localEmpty } = input;
  const someoneElses = !!meta && meta.uid !== uid;
  if (!remote) return localEmpty ? 'none' : someoneElses ? 'wipe' : 'push';
  if (localEmpty || someoneElses || !meta) return 'pull';
  const cloudChanged = remote.updatedAt > meta.remoteAt;
  const phoneChanged = localChange > meta.syncedChange;
  if (cloudChanged && phoneChanged) return Date.parse(remote.updatedAt) > localChange ? 'pull' : 'push';
  if (cloudChanged) return 'pull';
  if (phoneChanged) return 'push';
  return 'none';
}

