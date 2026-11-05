import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '@/ui/text';
import { dateFmt, newId } from '@/engine/format';
import { dayActivity } from '@/engine/site';
import { writeDailyLog } from '@/engine/siteAI';
import { useApp } from '@/store/AppContext';
import { aiFor } from '@/ui/host';
import { Button, C, Card, Field, H2, Muted, Screen } from '@/ui/kit';
import { confirmAction, notify } from '@/ui/notify';
import { useToday } from '@/ui/useToday';

/** Daily logs: Claude drafts today's from the photos and finished tasks; you edit and save. */
export default function LogScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { projects, updateProject, apiKey, aiAllowed } = useApp();
  const today = useToday();
  const p = projects.find((x) => x.id === id);
  const existing = p?.logs.find((l) => l.date === today);
  const [text, setText] = useState(existing?.text ?? '');
  const [busy, setBusy] = useState(false);
  if (!p) return <Screen><Muted>This project was deleted.</Muted></Screen>;

  const act = dayActivity(p, today);
  const photosToday = act.reduce((t, a) => t + a.photos.length, 0);
  const doneToday = act.reduce((t, a) => t + a.done.length, 0);

  const draft = async () => {
    setBusy(true);
    try {
      setText(await writeDailyLog(aiFor(apiKey, aiAllowed), p, today));
    } catch (e) {
      notify('Bidwell could not write the log', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    const t = text.trim();
    if (!t) return;
    updateProject(p.id, (x) => ({
      ...x, logs: [{ id: existing?.id ?? newId(), date: today, text: t }, ...x.logs.filter((l) => l.date !== today)],
    }));
    notify('Daily log saved');
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Daily log' }} />
      <Card>
        <H2>Today · {dateFmt(`${today}T12:00:00`)}</H2>
        <Muted style={{ fontSize: 13 }}>{photosToday} photo{photosToday === 1 ? '' : 's'} and {doneToday} finished task{doneToday === 1 ? '' : 's'} today.</Muted>
        <Button kind="secondary" title={busy ? 'Bidwell is writing…' : 'Write today’s log with Bidwell'} disabled={busy} onPress={draft} />
        <Field label="Log" multiline value={text} onChangeText={setText} placeholder="Work done, what’s next, anything to watch." />
        <Button title={existing ? 'Update today’s log' : 'Save today’s log'} disabled={!text.trim()} onPress={save} />
      </Card>

      {p.logs.filter((l) => l.date !== today).length ? <H2>Earlier</H2> : null}
      {p.logs.filter((l) => l.date !== today).sort((a, b) => b.date.localeCompare(a.date)).map((l) => (
        <Card key={l.id} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontWeight: '700', color: C.ink }}>{dateFmt(`${l.date}T12:00:00`)}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Delete log" hitSlop={8}
              onPress={() => confirmAction('Delete this log?', '', 'Delete', () => updateProject(p.id, (x) => ({ ...x, logs: x.logs.filter((y) => y.id !== l.id) })))}>
              <Text style={{ color: C.muted }}>Delete</Text>
            </Pressable>
          </View>
          <Text selectable style={{ color: C.ink2, lineHeight: 21 }}>{l.text}</Text>
        </Card>
      ))}
    </Screen>
  );
}
