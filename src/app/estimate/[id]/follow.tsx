import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, Share, View } from 'react-native';

import { newId } from '@/engine/format';
import {
  confirmations, consentQuestion, followUpText, newPlan, nextFollowUp, okToSendNow, parseDays, planProblems, stopPlan, SUGGESTED_DAYS,
  type ConsentHow, type FollowChannel, type FollowUpPlan,
} from '@/engine/followup';
import { addDays, type CalEvent } from '@/engine/schedule';
import { useApp } from '@/store/AppContext';
import { Banner, Button, C, Card, Chip, Field, H2, Muted, Screen } from '@/ui/kit';
import { notify } from '@/ui/notify';
import { cancelReminder, scheduleReminder } from '@/ui/reminders';
import { Text } from '@/ui/text';
import { useToday } from '@/ui/useToday';

const HOWS: ConsentHow[] = ['in person', 'phone call', 'text', 'email'];
const isFollowEvent = (e: CalEvent, estimateId: string) => e.estimateId === estimateId && e.title.startsWith('Follow up:');

/** Opens the phone's own Messages or Mail with the text filled in. The contractor presses send. */
async function compose(channel: FollowChannel, to: string, text: string, subject: string) {
  const url = channel === 'text'
    ? `sms:${to.replace(/[^\d+]/g, '')}${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(text)}`
    : `mailto:${to.trim()}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
  try {
    await Linking.openURL(url);
  } catch {
    await Share.share({ message: text }).catch(() => {});
  }
}

/** Follow-ups for a quote the client hasn't signed: only with their permission, on a schedule the contractor must set. */
export default function FollowScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { estimates, followups, saveFollowUp, profile, events, saveEvent, deleteEvent } = useApp();
  const today = useToday();
  const est = estimates.find((e) => e.id === id);
  const saved = followups?.find((f) => f.estimateId === id);
  const [p, setP] = useState<FollowUpPlan>(() => saved ?? newPlan(id ?? '', today));
  const [daysText, setDaysText] = useState((saved?.days ?? []).join(', '));
  const [confirm, setConfirm] = useState<{ client: string; contractor: string } | null>(null);
  if (!est) return <Screen><Muted>This estimate was deleted.</Muted></Screen>;
  const company = profile?.companyName || 'Your contractor';
  const problems = planProblems(p);
  const next = nextFollowUp(saved, est.status);
  const set = (patch: Partial<FollowUpPlan>) => setP((x) => ({ ...x, ...patch }));
  const to = (c: FollowChannel) => (c === 'text' ? p.phone : p.email);

  // One reminder on the calendar per follow-up day, so it rings on the contractor's phone.
  const syncCalendar = async (plan: FollowUpPlan) => {
    for (const e of events.filter((x) => isFollowEvent(x, est.id) && !x.done)) { cancelReminder(e.notificationId); deleteEvent(e.id); }
    if (plan.stopped || plan.consent !== 'agreed') return;
    const done = new Set(plan.sent.map((s) => s.day));
    for (const day of plan.days.filter((d) => !done.has(d))) {
      const date = addDays(plan.startDate, day);
      if (date < today) continue;
      const e: CalEvent = {
        id: newId(), title: `Follow up: ${est.clientName || est.title} (day ${day})`, kind: 'call', date, time: '10:00', durationMin: 15,
        estimateId: est.id, address: '', notes: `Quote: ${est.title}. Bidwell has the message ready in Follow-ups.`, remindMin: 0, done: false,
        createdAt: new Date().toISOString(),
      };
      const r = await scheduleReminder(e).catch(() => ({ id: undefined }));
      saveEvent(r.id ? { ...e, notificationId: r.id } : e);
    }
  };

  const save = async () => {
    const plan = { ...p, days: parseDays(daysText) };
    if (planProblems(plan).length) { setP(plan); return; }
    const first = !saved?.confirmedBoth;
    const final = first ? { ...plan, confirmedBoth: new Date().toISOString() } : plan;
    saveFollowUp(final);
    setP(final);
    await syncCalendar(final);
    if (first) setConfirm(confirmations(final, company, est.clientName || 'the client', est.title));
    else router.back();
  };

  const stop = async (reason: 'declined' | 'stop' | 'manual') => {
    const plan = stopPlan({ ...p, days: parseDays(daysText) }, reason, new Date().toISOString());
    saveFollowUp(plan);
    setP(plan);
    await syncCalendar(plan);
    notify('Follow-ups stopped', reason === 'manual' ? 'No more reminders for this quote.' : 'The client said no. Bidwell will never remind them about this quote again.');
  };

  const sendNext = async (channel: FollowChannel) => {
    if (!next || !saved) return;
    if (!okToSendNow(new Date())) { notify('Quiet hours', 'Send between 8 AM and 8 PM so you don’t wake the client.'); return; }
    const n = saved.sent.length + 1;
    await compose(channel, to(channel), followUpText(n, company, est.clientName, est.title), `${est.title}: quote from ${company}`);
    const plan = { ...saved, sent: [...saved.sent, { day: next.day, at: new Date().toISOString(), channel }] };
    saveFollowUp(plan);
    setP(plan);
    await syncCalendar(plan);
  };

  if (confirm) {
    return (
      <Screen footer={<Button title="Done" icon="checkmark" onPress={() => router.back()} />}>
        <Banner tone="ok" title="Follow-ups are on" />
        <Card>
          <H2>1. Send the client their confirmation</H2>
          <Text style={{ color: C.ink2, lineHeight: 21 }}>{confirm.client}</Text>
          {p.channels.map((c) => (
            <Button key={c} kind="secondary" title={c === 'text' ? 'Text it to the client' : 'Email it to the client'} icon={c === 'text' ? 'chatbubble-outline' : 'mail-outline'}
              onPress={() => compose(c, to(c), confirm.client, `Reminders from ${company}`)} />
          ))}
        </Card>
        <Card>
          <H2>2. Your record</H2>
          <Text style={{ color: C.ink2, lineHeight: 21 }}>{confirm.contractor}</Text>
          <Muted style={{ fontSize: 12 }}>Saved with the date and how the client agreed. Reminders are on your calendar.</Muted>
        </Card>
      </Screen>
    );
  }

  const stopped = !!p.stopped;
  return (
    <Screen footer={!stopped && p.consent === 'agreed' ? <Button title={saved?.confirmedBoth ? 'Save changes' : 'Turn on follow-ups'} icon="checkmark" onPress={save} /> : undefined}>
      <View style={{ gap: 2 }}>
        <Text style={{ color: C.ink, fontSize: 22, fontWeight: '800' }}>{est.title}</Text>
        <Muted>{est.clientName || 'Client'} · status {est.status}</Muted>
      </View>

      {stopped ? (
        <Banner tone="info" title={p.stopped?.reason === 'signed' ? 'Signed: follow-ups ended' : p.stopped?.reason === 'lost' ? 'Marked lost: follow-ups ended' : 'Follow-ups are stopped'}>
          {p.consent === 'declined' ? 'The client said no or replied STOP. Bidwell won’t remind them about this quote again.' : `Stopped ${p.stopped?.at.slice(0, 10)}.`}
        </Banner>
      ) : null}

      {next && saved ? (
        <Card>
          <H2>{next.date <= today ? `Follow-up ${saved.sent.length + 1} is due` : `Next follow-up: ${next.date}`}</H2>
          <Text style={{ color: C.ink2, lineHeight: 21 }}>{followUpText(saved.sent.length + 1, company, est.clientName, est.title)}</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {saved.channels.map((c) => (
              <Button key={c} title={c === 'text' ? 'Send text' : 'Send email'} icon={c === 'text' ? 'chatbubble-outline' : 'mail-outline'} style={{ flex: 1 }} onPress={() => sendNext(c)} />
            ))}
          </View>
          <Muted style={{ fontSize: 12 }}>Your phone’s Messages or Mail opens with the text; you press send.</Muted>
        </Card>
      ) : null}

      {!stopped ? (
        <Card>
          <H2>1. Ask the client first</H2>
          <Text style={{ color: C.ink2, lineHeight: 21 }}>“{consentQuestion(company, est.clientName || 'there')}”</Text>
          <Muted style={{ fontSize: 13 }}>Ask in person, by phone, or send this question. Only a clear yes turns follow-ups on.</Muted>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Chip label="Client said yes" selected={p.consent === 'agreed'} onPress={() => set({ consent: 'agreed', consentAt: p.consentAt ?? new Date().toISOString(), consentHow: p.consentHow ?? 'in person' })} />
            <Chip label="Not asked yet" selected={p.consent === 'not-asked'} onPress={() => set({ consent: 'not-asked' })} />
          </View>
          {p.consent === 'agreed' ? (
            <View style={{ gap: 6 }}>
              <Muted style={{ fontSize: 13 }}>How did they agree?</Muted>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {HOWS.map((h) => <Chip key={h} label={h} selected={p.consentHow === h} onPress={() => set({ consentHow: h })} />)}
              </View>
            </View>
          ) : null}
          <Button kind="danger" title="Client said no" onPress={() => stop('declined')} />
        </Card>
      ) : null}

      {!stopped && p.consent === 'agreed' ? (
        <Card>
          <H2>2. How and when</H2>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip label="Text" selected={p.channels.includes('text')} onPress={() => set({ channels: p.channels.includes('text') ? p.channels.filter((c) => c !== 'text') : [...p.channels, 'text'] })} />
            <Chip label="Email" selected={p.channels.includes('email')} onPress={() => set({ channels: p.channels.includes('email') ? p.channels.filter((c) => c !== 'email') : [...p.channels, 'email'] })} />
          </View>
          {p.channels.includes('text') ? <Field label="Client mobile" value={p.phone} onChangeText={(v) => set({ phone: v })} keyboardType="phone-pad" maxLength={30} /> : null}
          {p.channels.includes('email') ? <Field label="Client email" value={p.email} onChangeText={(v) => set({ email: v })} keyboardType="email-address" autoCapitalize="none" maxLength={120} /> : null}
          <Field label="Days after the quote was sent (required)" value={daysText} onChangeText={setDaysText} placeholder="e.g. 2, 5, 10" keyboardType="numbers-and-punctuation"
            help="Required: you must choose the follow-up days for every project. Up to 6, each 1–60." />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip label={`Suggested: ${SUGGESTED_DAYS.join(', ')}`} onPress={() => setDaysText(SUGGESTED_DAYS.join(', '))} />
          </View>
          <Field label="Quote sent on (YYYY-MM-DD)" value={p.startDate} onChangeText={(v) => set({ startDate: v })} maxLength={10} autoCapitalize="none" />
          {(() => {
            const left = planProblems({ ...p, days: parseDays(daysText) });
            return left.length ? <Banner tone="warn" title="Before you turn it on">{left.join(' ')}</Banner> : null;
          })()}
          <Muted style={{ fontSize: 12 }}>Messages end with “Reply STOP to opt out”, go out only 8 AM–8 PM, and stop when the quote is signed or marked lost.</Muted>
        </Card>
      ) : null}

      {!stopped && saved?.confirmedBoth ? <Button kind="ghost" title="Stop follow-ups" onPress={() => stop('manual')} /> : null}
      {problems.length && p.consent !== 'agreed' && !stopped ? <Muted style={{ fontSize: 12 }}>Follow-ups stay off until the client says yes.</Muted> : null}
    </Screen>
  );
}
