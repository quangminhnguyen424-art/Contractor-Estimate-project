import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useCloud } from '@/cloud/CloudProvider';
import { Banner, Button, C, Card, Field, H2, Muted, Screen } from '@/ui/kit';
import { PASSWORD_RULES } from '@/ui/LoginScreen';
import { confirmAction, notify } from '@/ui/notify';
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
        <ChangePassword />
        <Card>
          <H2>What your account does</H2>
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

/** Change password, like any app: current password, a new one that meets the rules, typed twice. */
function ChangePassword() {
  const cloud = useCloud();
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'warn' | 'ok'; text: string } | null>(null);
  const strong = PASSWORD_RULES.every((r) => r.ok(next));
  if (!open) return <Button kind="secondary" title="Change password" icon="key-outline" onPress={() => { setOpen(true); setMsg(null); }} />;
  const save = async () => {
    if (!strong) { setMsg({ tone: 'warn', text: `New password needs: ${PASSWORD_RULES.filter((r) => !r.ok(next)).map((r) => r.label.toLowerCase()).join(', ')}.` }); return; }
    if (next !== again) { setMsg({ tone: 'warn', text: 'The two new passwords don’t match.' }); return; }
    setBusy(true);
    const err = await cloud.changePassword(cur, next);
    setBusy(false);
    if (err) { setMsg({ tone: 'warn', text: err }); return; }
    setCur(''); setNext(''); setAgain(''); setOpen(false);
    setMsg(null);
    notify('Password changed', 'Use your new password the next time you log in.');
  };
  return (
    <Card>
      <H2>Change password</H2>
      <Field label="Current password" value={cur} onChangeText={setCur} secureTextEntry autoCapitalize="none" autoComplete="current-password" textContentType="password" />
      <Field label="New password" value={next} onChangeText={setNext} secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword"
        help="At least 8 characters with an uppercase letter, a lowercase letter and a number." />
      <Field label="New password again" value={again} onChangeText={setAgain} secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" />
      {msg ? <Banner tone={msg.tone} title={msg.text} /> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button kind="secondary" title="Cancel" onPress={() => setOpen(false)} style={{ flex: 1 }} />
        <Button title={busy ? 'Saving…' : 'Save'} disabled={busy || !cur || !next} onPress={save} style={{ flex: 1 }} />
      </View>
    </Card>
  );
}
