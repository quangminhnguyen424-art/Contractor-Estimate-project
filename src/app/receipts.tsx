import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useMyPlan } from '@/cloud/usePlan';
import { parseReceipt, receiptPrompt } from '@/engine/books';
import { money2 } from '@/engine/format';
import type { InboxItem } from '@/engine/inbox';
import { codeOf } from '@/engine/jobCode';
import { addDays } from '@/engine/schedule';
import type { SiteProject } from '@/engine/site';
import { useApp } from '@/store/AppContext';
import { aiFor } from '@/ui/host';
import { Banner, Button, C, Card, H2, Muted, Screen, Section, mono } from '@/ui/kit';
import { savePhoto } from '@/ui/photoStore';
import { toAiImage } from '@/ui/photos';
import { Text } from '@/ui/text';
import { useToday } from '@/ui/useToday';

const day = (ymd: string) => (ymd ? new Date(`${ymd}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '');
const amount = (n: number) => (n < 0 ? `−${money2(-n)}` : money2(n));

/**
 * Receipts: every purchase that reached Studwise. One whose job name is a job's code is already filed; the rest wait
 * here for the contractor to pick the job. Only the contractor's account sees this.
 */
export default function Receipts() {
  const { inbox = [], projects, addReceipt, fileReceipt, unfileReceipt, ignoreReceipt, restoreReceipt, apiKey, aiAllowed, deletePhotosLater } = useApp();
  const { plan } = useMyPlan();
  const today = useToday();
  const [reading, setReading] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'warn' | 'info' | 'ok'; title: string; text?: string } | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [allFiled, setAllFiled] = useState(false);

  // Starter keeps snap-a-receipt inside a job; the inbox is part of Pro and Team (and open while plans are off).
  const included = !plan || plan.plan === 'pro' || plan.plan === 'team' || plan.plan === 'beta';
  const open = projects.filter((p) => p.status === 'active');
  const jobs = [...open, ...projects.filter((p) => p.status !== 'active')];
  const titleOf = (id?: string) => projects.find((p) => p.id === id)?.title ?? 'a deleted job';
  const waiting = inbox.filter((x) => x.status === 'new');
  const since = addDays(today, -30);
  const filed = inbox.filter((x) => x.status === 'filed' && x.at.slice(0, 10) >= since);
  const aside = inbox.filter((x) => x.status === 'ignored' && x.at.slice(0, 10) >= since);

  const snap = async (camera: boolean) => {
    setMsg(null);
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : { granted: true };
    if (!perm.granted) { setMsg({ tone: 'warn', title: 'Allow the camera in your phone settings to snap receipts.' }); return; }
    const r = camera
      ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (r.canceled || !r.assets[0]) return;
    if (!aiAllowed) { setMsg({ tone: 'info', title: 'Studwise AI is off', text: 'Turn on AI sharing under Me → Studwise AI so Studwise can read receipts. Until then, add the cost inside the job.' }); return; }
    const saved = await savePhoto(r.assets[0].uri, r.assets[0].width).catch(() => null);
    if (!saved) { setMsg({ tone: 'warn', title: 'Could not save the photo. Try again.' }); return; }
    setReading(true);
    try {
      const img = await toAiImage(r.assets[0].uri);
      if (!img) throw new Error('Could not open the photo. Try another one.');
      const read = parseReceipt(await aiFor(apiKey, aiAllowed).complete(receiptPrompt([]), [{ ...img, label: 'Receipt' }], 1500));
      const res = addReceipt(read, 'photo', saved.uri);
      // A second photo of a purchase Studwise already holds is not kept.
      if (!res.keptFile) deletePhotosLater([saved.uri]);
      const what = `${read.vendor || 'Receipt'} ${amount(read.total)}`;
      if (res.duplicate) {
        setMsg({ tone: 'info', title: 'Studwise already has this purchase', text: `${what} is counted once.${res.filedTo ? ` It is now filed to ${titleOf(res.filedTo)}.` : ''}` });
      } else if (res.filedTo) {
        setMsg({ tone: 'ok', title: `Filed to ${titleOf(res.filedTo)}`, text: `${what}. The job name on the receipt matched this job’s code.` });
      } else {
        setMsg({ tone: 'info', title: 'Pick the job for this receipt', text: read.po ? `${what}. “${read.po}” on the receipt is not the code of one of your jobs.` : `${what}. There is no job name on it.` });
      }
    } catch (e) {
      deletePhotosLater([saved.uri]);
      setMsg({ tone: 'warn', title: 'Studwise could not read this receipt', text: e instanceof Error ? e.message : 'Try a sharper photo.' });
    } finally {
      setReading(false);
    }
  };

  if (!included) {
    return (
      <Screen>
        <Card>
          <H2>Receipts that file themselves</H2>
          <Muted>Your crew gives the job’s code at the store. Studwise reads every receipt and files it to that job, so each job’s cost and profit are complete without sorting receipts by hand. Part of the Pro and Team plans.</Muted>
          <Button title="See the plans" icon="diamond" onPress={() => router.push('/plan')} />
        </Card>
        <Muted>On your plan you can still snap a receipt inside a job: open the job, then Money → Costs and receipts.</Muted>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button title={reading ? 'Reading…' : 'Snap receipt'} icon="camera-outline" style={{ flex: 1 }} disabled={reading} onPress={() => snap(true)} />
        <Button title="Pick a photo" kind="secondary" style={{ flex: 1 }} disabled={reading} onPress={() => snap(false)} />
      </View>
      {msg ? <Banner tone={msg.tone} title={msg.title}>{msg.text ? <Text raw>{msg.text}</Text> : null}</Banner> : null}

      {inbox.length === 0 ? (
        <Card>
          <H2>How receipts find their job</H2>
          <Muted>Every job has a short code (open the job, then Money). At the store, your crew gives that code as the Job Name or PO. A receipt that carries a job’s code is filed to that job by Studwise. Any other receipt waits here, and one tap files it.</Muted>
        </Card>
      ) : null}

      {waiting.length ? <Section title={`Needs a job (${waiting.length})`} /> : null}
      {waiting.map((x) => (
        <Card key={x.id} style={{ gap: 10 }}>
          <Head item={x} />
          <JobPicker jobs={jobs} onPick={(pid) => fileReceipt(x.id, pid)} />
          <Button kind="ghost" title="Not a job cost" onPress={() => ignoreReceipt(x.id)} />
        </Card>
      ))}

      {filed.length ? <Section title="Filed, last 30 days" /> : null}
      {(allFiled ? filed : filed.slice(0, 8)).map((x) => (
        <Card key={x.id} style={{ gap: 8 }}>
          <Head item={x} />
          <Text style={{ color: x.auto ? C.okInk : C.ink2, fontSize: 14 }}>
            {x.auto ? 'Filed by Studwise to ' : 'Filed to '}<Text raw style={{ fontWeight: '600' }}>{titleOf(x.projectId)}</Text>
          </Text>
          {moving === x.id ? <JobPicker jobs={jobs.filter((p) => p.id !== x.projectId)} onPick={(pid) => { fileReceipt(x.id, pid); setMoving(null); }} /> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button kind="secondary" title={moving === x.id ? 'Cancel' : 'Move'} style={{ flex: 1 }} onPress={() => setMoving(moving === x.id ? null : x.id)} />
            <Button kind="secondary" title="Undo" style={{ flex: 1 }} onPress={() => { unfileReceipt(x.id); setMoving(null); }} />
          </View>
        </Card>
      ))}
      {filed.length > 8 && !allFiled ? <Button kind="ghost" title={`Show all ${filed.length}`} onPress={() => setAllFiled(true)} /> : null}

      {aside.length ? <Section title="Not job costs" /> : null}
      {aside.slice(0, 10).map((x) => (
        <Card key={x.id} style={{ gap: 8 }}>
          <Head item={x} />
          <Button kind="ghost" title="Put back" onPress={() => restoreReceipt(x.id)} />
        </Card>
      ))}
      <Muted style={{ fontSize: 13 }}>Only you and your team accounts see receipts. Studwise keeps what was bought and what it cost, never card or bank details.</Muted>
    </Screen>
  );
}

/** One receipt at a glance: store, day, amount, the job name it carries. */
function Head({ item }: { item: InboxItem }) {
  const n = item.lines.length;
  return (
    <View style={{ gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
        <Text raw style={{ flex: 1, color: C.ink, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>{item.vendor || 'Receipt'}</Text>
        <Text style={{ fontFamily: mono, color: item.total < 0 ? C.okInk : C.ink, fontSize: 16 }}>{amount(item.total)}</Text>
      </View>
      <Muted style={{ fontSize: 13 }}>
        {[day(item.date), item.total < 0 ? 'Return' : '', n ? `${n} item${n === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ') || 'No date on the receipt'}
      </Muted>
      {item.po ? <Muted style={{ fontSize: 13 }}>{`Job name on the receipt: ${item.po}`}</Muted> : null}
    </View>
  );
}

/** The jobs a receipt can go to, open jobs first, each shown by the code the crew gives at the store. */
function JobPicker({ jobs, onPick }: { jobs: SiteProject[]; onPick: (projectId: string) => void }) {
  const [all, setAll] = useState(false);
  if (!jobs.length) return <Muted style={{ fontSize: 13 }}>No job sites yet. A job gets one when its quote is signed, or from the job’s Money tab.</Muted>;
  return (
    <View style={{ gap: 6 }}>
      {(all ? jobs : jobs.slice(0, 5)).map((p) => (
        <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`File to ${codeOf(p)} ${p.title}`} onPress={() => onPick(p.id)}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: pressed ? C.line : C.cardHi })}>
          <Text raw style={{ fontFamily: mono, color: C.accent, fontSize: 14, minWidth: 64 }}>{codeOf(p)}</Text>
          <Text raw style={{ flex: 1, color: C.ink, fontSize: 15 }} numberOfLines={1}>{p.title}</Text>
          {p.status !== 'active' ? <Muted style={{ fontSize: 12 }}>Finished</Muted> : null}
        </Pressable>
      ))}
      {jobs.length > 5 && !all ? <Button kind="ghost" title={`All ${jobs.length} jobs`} onPress={() => setAll(true)} /> : null}
    </View>
  );
}
