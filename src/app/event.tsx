import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { newId } from '@/engine/format';
import { addDays, dayLabel, eventIcs, isYmd, KINDS, REMINDERS, type CalEvent, type EventKind } from '@/engine/schedule';
import { useApp } from '@/store/AppContext';
import { Button, C, Card, Chip, Field, Label, Muted, Screen } from '@/ui/kit';
import { PressScale } from '@/ui/motion';
import { confirmAction, notify } from '@/ui/notify';
import { cancelReminder, remindersAvailable, scheduleReminder } from '@/ui/reminders';
import { shareTextFile } from '@/ui/shareFile';
import { Text } from '@/ui/text';
import { useToday } from '@/ui/useToday';

const HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
const MINUTES = ['00', '15', '30', '45'];
const DURATIONS = [{ v: 30, l: '30 min' }, { v: 60, l: '1 hr' }, { v: 120, l: '2 hr' }, { v: 240, l: 'Half day' }, { v: 480, l: 'Full day' }];
const h12 = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? 'a' : 'p'}`;

/** Add or change an appointment: what, when, which job, and when to remind. */
export default function EventScreen() {
  const params = useLocalSearchParams<{ id?: string; date?: string; project?: string; estimate?: string }>();
  const { events, saveEvent, deleteEvent, projects, estimates, profile, team = [] } = useApp();
  const existing = events.find((e) => e.id === params.id);
  const today = useToday();
  const linkedProject = projects.find((p) => p.id === (existing?.projectId ?? params.project));
  const linkedEstimate = estimates.find((e) => e.id === (existing?.estimateId ?? params.estimate));
  const [title, setTitle] = useState(existing?.title ?? '');
  const [kind, setKind] = useState<EventKind>(existing?.kind ?? 'visit');
  const [date, setDate] = useState(existing?.date ?? (params.date && isYmd(params.date) ? params.date : today));
  const [hour, setHour] = useState<number | null>(existing ? (existing.time ? Number(existing.time.slice(0, 2)) : null) : 9);
  const [minute, setMinute] = useState(existing?.time ? existing.time.slice(3) : '00');
  const [duration, setDuration] = useState(existing?.durationMin ?? 60);
  const [projectId, setProjectId] = useState(linkedProject?.id);
  const [estimateId, setEstimateId] = useState(linkedProject ? linkedProject.estimateId : linkedEstimate?.id);
  const [address, setAddress] = useState(existing?.address ?? linkedProject?.address ?? linkedEstimate?.address ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [remindMin, setRemind] = useState<number | null>(existing ? existing.remindMin : 60);
  const [saving, setSaving] = useState(false);
  const [crew, setCrew] = useState<string[]>(existing?.crew ?? []);
  const days = Array.from({ length: 60 }, (_, i) => addDays(today, i));
  const jobs = [
    ...projects.filter((p) => p.status === 'active').map((p) => ({ key: `p:${p.id}`, label: p.title, projectId: p.id, estimateId: p.estimateId, address: p.address })),
    ...estimates.filter((e) => (e.status === 'sent' || e.status === 'draft') && !projects.some((p) => p.estimateId === e.id)).slice(0, 8)
      .map((e) => ({ key: `e:${e.id}`, label: e.title, projectId: undefined, estimateId: e.id, address: e.address })),
  ];
  const selectedJob = jobs.find((j) => (projectId ? j.projectId === projectId : !!estimateId && j.estimateId === estimateId && !j.projectId));

  const build = (): CalEvent => ({
    id: existing?.id ?? newId(),
    title: title.trim() || KINDS[kind].en,
    kind, date,
    time: hour === null ? '' : `${String(hour).padStart(2, '0')}:${minute}`,
    durationMin: hour === null ? 0 : duration,
    ...(projectId ? { projectId } : {}), ...(estimateId ? { estimateId } : {}),
    address: address.trim(), notes: notes.trim(), remindMin,
    ...(existing?.notificationId ? { notificationId: existing.notificationId } : {}),
    done: existing?.done ?? false,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    ...(crew.length ? { crew } : {}),
    ...(existing?.attend ? { attend: existing.attend } : {}),
  });

  const save = async () => {
    setSaving(true);
    const e = build();
    try {
      const r = await scheduleReminder(e);
      const { notificationId: _old, ...rest } = e;
      saveEvent(r.id ? { ...rest, notificationId: r.id } : rest);
      if (r.blocked) notify('Saved, but reminders are off', 'Turn on notifications for Bidwell AI in your iPhone Settings to get reminders.');
      router.back();
    } catch {
      saveEvent(e);
      notify('Saved without a reminder', 'The reminder could not be set. The appointment is on your calendar.');
      router.back();
    } finally {
      setSaving(false);
    }
  };

  const addToCalendar = async () => {
    try {
      const ok = await shareTextFile(`${title.trim() || KINDS[kind].en}.ics`, eventIcs(build(), profile?.companyName ?? ''), 'text/calendar', 'com.apple.ical.ics');
      if (!ok) notify('Could not share the calendar file');
    } catch {
      notify('Could not share the calendar file');
    }
  };

  return (
    <Screen footer={<Button title={saving ? 'Saving…' : existing ? 'Save changes' : 'Add to schedule'} icon="checkmark" disabled={saving} onPress={save} />}>
      <Stack.Screen options={{ title: existing ? 'Appointment' : 'New appointment' }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(Object.keys(KINDS) as EventKind[]).map((k) => <Chip key={k} label={KINDS[k].en} selected={kind === k} onPress={() => setKind(k)} />)}
      </View>
      <Field label="Title" value={title} onChangeText={setTitle} maxLength={120} placeholder={`${KINDS[kind].en}${selectedJob ? ` — ${selectedJob.label}` : ''}`} />

      <Label>Day</Label>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {(days.includes(date) ? days : [date, ...days]).map((d) => {
          const on = d === date;
          const dt = new Date(`${d}T12:00:00`);
          return (
            <PressScale key={d} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={dayLabel(d, today)} onPress={() => setDate(d)}
              style={{ width: 52, paddingVertical: 8, borderRadius: 14, alignItems: 'center', backgroundColor: on ? C.accent : C.card, borderWidth: 1, borderColor: on ? C.accent : C.line }}>
              <Text style={{ color: on ? C.onAccent : C.muted, fontSize: 11 }}>{d === today ? 'Today' : dt.toLocaleDateString('en-US', { weekday: 'short' })}</Text>
              <Text style={{ color: on ? C.onAccent : C.ink, fontSize: 17, fontWeight: '800' }}>{dt.getDate()}</Text>
              <Text style={{ color: on ? C.onAccent : C.muted, fontSize: 10 }}>{dt.toLocaleDateString('en-US', { month: 'short' })}</Text>
            </PressScale>
          );
        })}
      </ScrollView>

      <Label>Time</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <Chip label="All day" selected={hour === null} onPress={() => setHour(null)} />
        {HOURS.map((h) => <Chip key={h} label={h12(h)} selected={hour === h} onPress={() => setHour(h)} />)}
      </View>
      {hour !== null ? (
        <>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {MINUTES.map((m) => <Chip key={m} label={`:${m}`} selected={minute === m} onPress={() => setMinute(m)} />)}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {DURATIONS.map((d) => <Chip key={d.v} label={d.l} selected={duration === d.v} onPress={() => setDuration(d.v)} />)}
          </View>
        </>
      ) : null}

      {jobs.length ? (
        <>
          <Label>Job</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <Chip label="None" selected={!selectedJob} onPress={() => { setProjectId(undefined); setEstimateId(undefined); }} />
            {jobs.map((j) => (
              <Chip key={j.key} label={j.label} selected={selectedJob?.key === j.key}
                onPress={() => { setProjectId(j.projectId); setEstimateId(j.estimateId); if (!address.trim()) setAddress(j.address); }} />
            ))}
          </View>
        </>
      ) : null}
      <Field label="Address" value={address} onChangeText={setAddress} maxLength={160} placeholder="Where" />

      {kind === 'crew' || kind === 'delivery' || kind === 'inspection' ? (
        <>
          <Label>Who is coming</Label>
          {team.filter((m) => m.active).length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {team.filter((m) => m.active).map((m) => (
                <Chip key={m.id} label={`${m.name}${m.trade ? ` · ${m.trade}` : ''}`} selected={crew.includes(m.id)}
                  onPress={() => setCrew(crew.includes(m.id) ? crew.filter((x) => x !== m.id) : [...crew, m.id])} />
              ))}
            </View>
          ) : (
            <Chip label="+ Add your crew and subs" onPress={() => router.push('/team')} />
          )}
        </>
      ) : null}

      <Label>Remind me</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {REMINDERS.map((r) => <Chip key={String(r.value)} label={r.label} selected={remindMin === r.value} onPress={() => setRemind(r.value)} />)}
      </View>
      {!remindersAvailable ? <Muted style={{ fontSize: 12 }}>Reminders ring in the installed iPhone app.</Muted> : null}
      <Field label="Notes" multiline value={notes} onChangeText={setNotes} placeholder="Gate code, what to bring, who to call." />

      <Card style={{ gap: 6 }}>
        <Button kind="secondary" title="Add to iPhone calendar / send to crew" icon="calendar-outline" onPress={addToCalendar} />
        {existing ? (
          <>
            <Button kind="secondary" title={existing.done ? 'Mark not done' : 'Mark done'} icon="checkmark-done-outline"
              onPress={async () => {
                const e = { ...build(), done: !existing.done };
                // Done: no more reminder. Not done again: put the reminder back.
                const r = await scheduleReminder(e).catch(() => ({ id: undefined }));
                const { notificationId: _old, ...rest } = e;
                saveEvent(r.id ? { ...rest, notificationId: r.id } : rest);
                router.back();
              }} />
            <Button kind="danger" title="Delete appointment"
              onPress={() => confirmAction('Delete this appointment?', existing.title, 'Delete', () => { cancelReminder(existing.notificationId); deleteEvent(existing.id); router.back(); })} />
          </>
        ) : null}
      </Card>
    </Screen>
  );
}
