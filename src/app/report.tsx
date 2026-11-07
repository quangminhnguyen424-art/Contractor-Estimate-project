import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Linking, Platform, View } from 'react-native';

import { useCloud } from '@/cloud/CloudProvider';
import { sendTicket, type TicketKind } from '@/cloud/support';
import { deviceSummary } from '@/engine/help';
import { SUPPORT_EMAIL } from '@/engine/legal';
import { Banner, Button, C, Card, Field, Muted, Screen, Select } from '@/ui/kit';
import { deletePhotoFile, savePhoto, usePhotoUri } from '@/ui/photoStore';
import { Text } from '@/ui/text';

const KINDS: { value: TicketKind; label: string }[] = [
  { value: 'bug', label: 'Something is broken' },
  { value: 'question', label: 'I have a question' },
  { value: 'billing', label: 'Billing or my subscription' },
  { value: 'idea', label: 'Idea or feature request' },
  { value: 'other', label: 'Something else' },
];

const device = () => deviceSummary({
  os: Platform.OS, osVersion: String(Platform.Version ?? ''), model: Device.modelName,
  appVersion: Constants.expoConfig?.version, build: Constants.expoConfig?.ios?.buildNumber ?? null,
});

/** Report a problem: the contractor's words, an optional screenshot, and the phone and app version, sent to support. */
export default function ReportScreen() {
  const cloud = useCloud();
  const [kind, setKind] = useState<TicketKind>('bug');
  const [message, setMessage] = useState('');
  const [shot, setShot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pick = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (r.canceled || !r.assets[0]) return;
    const saved = await savePhoto(r.assets[0].uri, r.assets[0].width).catch(() => null);
    if (saved) { if (shot) deletePhotoFile(shot); setShot(saved.uri); }
  };

  const emailInstead = () => {
    const body = `${message.trim()}\n\n---\n${KINDS.find((k) => k.value === kind)?.label}\n${device()}${cloud.user?.email ? `\nAccount: ${cloud.user.email}` : ''}`;
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Bidwell AI: problem report')}&body=${encodeURIComponent(body)}`);
  };

  const send = async () => {
    setTried(true);
    if (message.trim().length < 3) return;
    if (!cloud.user) { emailInstead(); return; }
    setBusy(true); setErr(null);
    try {
      await sendTicket({ uid: cloud.user.id, email: cloud.user.email, kind, message, device: device(), screenshotUri: shot });
      if (shot) deletePhotoFile(shot);
      setSent(true);
    } catch {
      setErr('Could not send it from the app. Tap Email it instead and it goes to support by email.');
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Screen footer={<Button title="Done" icon="checkmark" onPress={() => router.back()} />}>
        <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 28 }}>
          <Text style={{ fontSize: 40 }}>✅</Text>
          <Text style={{ color: C.ink, fontSize: 20, fontWeight: '700', textAlign: 'center' }}>Thanks, we got it</Text>
          <Muted style={{ textAlign: 'center' }}>A person reads every report. We reply to {cloud.user?.email ?? 'your email'}, usually within one business day.</Muted>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen footer={<Button title={busy ? 'Sending…' : 'Send report'} icon="send" disabled={busy} onPress={send} />}>
      <Select<TicketKind> label="What is it about?" value={kind} onChange={setKind} options={KINDS} />
      <Field label="What happened?" value={message} onChangeText={setMessage} multiline maxLength={4000}
        placeholder={kind === 'bug' ? 'What were you doing, what did you expect, and what happened instead?' : 'Tell us in your own words.'}
        error={tried && message.trim().length < 3 ? 'Please tell us what happened' : null} />
      <Card>
        <Text style={{ color: C.ink, fontWeight: '600' }}>Screenshot (optional)</Text>
        {shot ? <Shot uri={shot} /> : null}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button kind="secondary" icon="image-outline" title={shot ? 'Change' : 'Add a screenshot'} onPress={pick} style={{ flex: 1 }} />
          {shot ? <Button kind="ghost" title="Remove" onPress={() => { deletePhotoFile(shot); setShot(null); }} /> : null}
        </View>
      </Card>
      <Muted style={{ fontSize: 12 }}>Also sent: {device()}. Never your estimates, clients or prices.</Muted>
      {err ? <Banner tone="warn" title={err} /> : null}
      <Button kind="ghost" icon="mail-outline" title="Email it instead" onPress={emailInstead} />
    </Screen>
  );
}

function Shot({ uri }: { uri: string }) {
  const src = usePhotoUri(uri);
  return <Image source={{ uri: src }} style={{ width: 120, height: 200, borderRadius: 12, backgroundColor: C.cardHi }} resizeMode="cover" />;
}
