import { router } from 'expo-router';
import { useState } from 'react';

import { useCloud } from '@/cloud/CloudProvider';
import { Banner, Button, C, Card, H2, Muted, Screen } from '@/ui/kit';
import { confirmAction } from '@/ui/notify';
import { Text } from '@/ui/text';

/** Bidwell cloud: sign in so data and photos are backed up, the AI works without a key, and clients can sign online. */
export default function AccountScreen() {
  const cloud = useCloud();
  const [msg, setMsg] = useState<{ tone: 'warn' | 'ok' | 'info'; text: string } | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  if (!cloud.configured) return <Screen><Banner tone="info" title="Bidwell cloud is not set up in this version." /></Screen>;

  if (cloud.user) {
    const status = { off: 'Off', syncing: 'Syncing…', ok: 'Up to date', error: 'Could not sync' }[cloud.state];
    return (
      <Screen>
        <Card>
          <H2>Signed in</H2>
          <Text style={{ color: C.ink, fontSize: 16 }}>{cloud.user.email}</Text>
          <Muted>Sync: {status}{cloud.lastSync ? ` · ${new Date(cloud.lastSync).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}</Muted>
          {cloud.error ? <Banner tone="warn" title={cloud.error} /> : null}
          <Button kind="secondary" title="Sync now" icon="sync-outline" disabled={cloud.state === 'syncing'} onPress={() => cloud.syncNow()} />
          <Button kind="secondary" title={progress ?? 'Back up all photos now'} icon="cloud-upload-outline" disabled={!!progress}
            onPress={async () => {
              setProgress('Starting…');
              const n = await cloud.backupNow((d, t) => setProgress(`Uploading ${d + 1} of ${t}…`));
              setProgress(null);
              setMsg({ tone: 'ok', text: n ? `${n} photo${n > 1 ? 's' : ''} backed up.` : 'All photos are already backed up.' });
            }} />
          {msg ? <Banner tone={msg.tone} title={msg.text} /> : null}
        </Card>
        <Card>
          <H2>What the cloud does</H2>
          <Muted>• Your estimates, jobs, money and calendar are saved to your private account and come back on a new phone.</Muted>
          <Muted>• Job photos and receipts are backed up privately. Only you can open them.</Muted>
          <Muted>• Bidwell’s AI works without your own API key.</Muted>
          <Muted>• Clients can sign quotes and change orders from a link on their own phone.</Muted>
        </Card>
        <Button kind="secondary" title={progress === 'out' ? 'Saving and logging out…' : 'Log out'} icon="log-out-outline" disabled={!!progress}
          onPress={() => confirmAction('Log out?', 'Your work is saved to your account first. This phone is then cleared until you log in again.', 'Log out', async () => {
            setProgress('out');
            const err = await cloud.signOut();
            setProgress(null);
            if (err) confirmAction('Not saved to the cloud', err, 'Log out anyway', () => { cloud.signOut(true); });
          })} />
        <Button kind="danger" title="Delete my account"
          onPress={() => confirmAction('Delete your Bidwell account?', 'Your account, the cloud copy of your data and all backed-up photos are deleted for good. Data on this phone stays until you erase it in Settings.', 'Delete', async () => {
            const err = await cloud.deleteAccount();
            setMsg(err ? { tone: 'warn', text: err } : { tone: 'ok', text: 'Your account was deleted.' });
          })} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <H2>You’re not logged in</H2>
        <Muted>Log in to back up your work, use Bidwell’s AI and let clients sign online.</Muted>
        <Button title="Log in" icon="log-in-outline" onPress={() => router.push('/login')} />
      </Card>
    </Screen>
  );
}
