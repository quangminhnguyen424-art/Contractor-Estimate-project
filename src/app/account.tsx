import { useState } from 'react';
import { View } from 'react-native';

import { useCloud } from '@/cloud/CloudProvider';
import { Banner, Button, C, Card, Field, H2, Muted, Screen, Segmented } from '@/ui/kit';
import { confirmAction } from '@/ui/notify';
import { Text } from '@/ui/text';

/** Bidwell cloud: sign in so data and photos are backed up, the AI works without a key, and clients can sign online. */
export default function AccountScreen() {
  const cloud = useCloud();
  const [mode, setMode] = useState<'in' | 'up'>('up');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'warn' | 'ok' | 'info'; text: string } | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const go = async () => {
    setBusy(true); setMsg(null);
    const err = mode === 'in' ? await cloud.signIn(email, password) : await cloud.signUp(email, password);
    setBusy(false);
    if (err) setMsg({ tone: /confirm/i.test(err) ? 'info' : 'warn', text: err });
    else setPassword('');
  };

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
        <Button kind="secondary" title="Sign out" icon="log-out-outline" onPress={() => cloud.signOut()} />
        <Button kind="danger" title="Delete my account"
          onPress={() => confirmAction('Delete your Bidwell account?', 'Your account, the cloud copy of your data and all backed-up photos are deleted for good. Data on this phone stays until you erase it in Settings.', 'Delete', async () => {
            const err = await cloud.deleteAccount();
            setMsg(err ? { tone: 'warn', text: err } : { tone: 'ok', text: 'Your account was deleted.' });
          })} />
      </Screen>
    );
  }

  return (
    <Screen footer={<Button title={busy ? 'One moment…' : mode === 'in' ? 'Sign in' : 'Create account'} icon="checkmark" disabled={busy || !/\S+@\S+\.\S+/.test(email) || password.length < 8} onPress={go} />}>
      <View style={{ gap: 4 }}>
        <Text style={{ color: C.ink, fontSize: 24, fontWeight: '800' }}>Bidwell cloud</Text>
        <Muted>Back up your work, use the AI without a key, and let clients sign online.</Muted>
      </View>
      <Segmented options={[{ value: 'up', label: 'New account' }, { value: 'in', label: 'Sign in' }]} value={mode} onChange={setMode} />
      <Card>
        <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" maxLength={120} />
        <Field label="Password (8 or more characters)" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none"
          autoComplete={mode === 'up' ? 'new-password' : 'current-password'} textContentType={mode === 'up' ? 'newPassword' : 'password'} maxLength={72} />
        {msg ? <Banner tone={msg.tone} title={msg.text} /> : null}
      </Card>
      <Muted style={{ fontSize: 12 }}>By creating an account you agree to the Terms of Use and Privacy Policy you accepted in the app. You can delete your account here at any time.</Muted>
    </Screen>
  );
}
