import { Stack, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Platform, Pressable, useWindowDimensions, View } from 'react-native';

import {
  beforeAfterPairs, clientUpdateHtml, LANG_NAMES, workOrderHtml, type CrewLang, type SiteProject,
} from '@/engine/site';
import { Text } from '@/ui/text';
import { translateAll, writeClientUpdate, writePost } from '@/engine/siteAI';
import { useApp } from '@/store/AppContext';
import { aiFor } from '@/ui/host';
import { Banner, Button, C, Card, Chip, Field, H2, Label, Muted, Screen, Segmented } from '@/ui/kit';
import { confirmAction, notify } from '@/ui/notify';
import { photoDataUrl, resolvePhotoUri } from '@/ui/photoStore';
import { sharePdf } from '@/ui/share';
import { shareText } from '@/ui/shareText';
import { PhotoView } from '@/ui/SitePhotoView';

type Mode = 'crew' | 'client' | 'post';

const weekAgo = () => new Date(Date.now() - 7 * 86400000).toISOString();

/** Embeddable copies of the given photos, one at a time (phones run out of memory doing many at once). */
async function photoSources(p: SiteProject, ids: Set<string>) {
  const out: Record<string, string> = {};
  for (const r of p.rooms) for (const ph of r.photos) {
    if (!ids.has(ph.id)) continue;
    const src = await photoDataUrl(ph.uri);
    if (src) out[ph.id] = src;
  }
  return out;
}

export default function ShareScreen() {
  const { id, mode: modeParam, room } = useLocalSearchParams<{ id: string; mode?: Mode; room?: string }>();
  const { projects, updateProject, apiKey, profile } = useApp();
  const { width } = useWindowDimensions();
  const p = projects.find((x) => x.id === id);
  const [mode, setMode] = useState<Mode>(modeParam === 'client' || modeParam === 'post' ? modeParam : 'crew');
  const [rooms, setRooms] = useState<string[]>(room ? [room] : p?.rooms.map((r) => r.id) ?? []);
  const [lang, setLang] = useState<CrewLang>('en');
  const [clientLang, setClientLang] = useState<'en' | 'vi'>(profile?.quoteLanguage ?? 'en');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  if (!p) return <Screen><Muted>This project was deleted.</Muted></Screen>;
  const company = profile?.companyName ?? '';
  const pairs = beforeAfterPairs(p);
  // Photos the client hasn't seen: everything since the last update (or the last 7 days), newest 12.
  const since = p.lastClientUpdateAt ?? weekAgo();
  const recent = p.rooms.flatMap((r) => r.photos).filter((ph) => ph.takenAt > since)
    .sort((a, b) => b.takenAt.localeCompare(a.takenAt)).slice(0, 12);
  const ai = aiFor(apiKey);

  /** Translates the open tasks in the chosen rooms that don't have this language yet, and saves them. */
  const withTranslations = async (): Promise<SiteProject> => {
    if (lang === 'en') return p;
    const missing = p.rooms.filter((r) => rooms.includes(r.id)).flatMap((r) => r.tasks.filter((t) => !t.done && !t.tr?.[lang]));
    if (!missing.length) return p;
    const translated = await translateAll(ai, missing.map((t) => t.text), lang);
    const byId = new Map<string, string>();
    missing.forEach((t, i) => { const tr = translated[i]; if (tr) byId.set(t.id, tr); });
    if (byId.size < missing.length) {
      notify(`${missing.length - byId.size} task${missing.length - byId.size === 1 ? '' : 's'} not translated`, 'Those show in English. Try again in a moment to translate them.');
    }
    if (!byId.size) return p;
    const next: SiteProject = {
      ...p, rooms: p.rooms.map((r) => ({ ...r, tasks: r.tasks.map((t) => (byId.has(t.id) ? { ...t, tr: { ...t.tr, [lang]: byId.get(t.id)! } } : t)) })),
    };
    updateProject(p.id, (x) => ({
      ...x, rooms: x.rooms.map((r) => ({ ...r, tasks: r.tasks.map((t) => (byId.has(t.id) ? { ...t, tr: { ...t.tr, [lang]: byId.get(t.id)! } } : t)) })),
    }));
    return next;
  };

  const crewPdf = async () => {
    setBusy('pdf');
    try {
      const proj = await withTranslations();
      const ids = new Set(proj.rooms.filter((r) => rooms.includes(r.id)).flatMap((r) => r.photos.filter((ph) => ph.kind !== 'after').map((ph) => ph.id)));
      const html = workOrderHtml(proj, rooms, lang, await photoSources(proj, ids), company);
      await sharePdf(html, `Work order — ${proj.title}`);
    } catch (e) {
      notify('Could not make the work order', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(null);
    }
  };

  const crewText = async () => {
    setBusy('text');
    try {
      const proj = await withTranslations();
      const lines = proj.rooms.filter((r) => rooms.includes(r.id)).map((r) => {
        const open = r.tasks.filter((t) => !t.done);
        return open.length ? `${r.name}\n${open.map((t, i) => `${i + 1}. ${lang === 'en' ? t.text : t.tr?.[lang] ?? t.text}`).join('\n')}` : '';
      }).filter(Boolean);
      if (!lines.length) return notify('No open tasks', 'Add tasks to these rooms first.');
      await shareText(`${proj.title}${proj.address ? ` (${proj.address})` : ''}\n\n${lines.join('\n\n')}`, proj.title);
    } catch (e) {
      notify('Could not make the message', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(null);
    }
  };

  const write = async () => {
    setBusy('write');
    try {
      setText(mode === 'client' ? await writeClientUpdate(ai, p, clientLang) : await writePost(ai, p, pairs.length, clientLang));
    } catch (e) {
      notify('Bidwell could not write it', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(null);
    }
  };

  const clientPdf = async () => {
    setBusy('pdf');
    try {
      const ids = new Set([...pairs.flatMap((x) => [x.before.id, x.after.id]), ...recent.map((ph) => ph.id)]);
      const shared = await sharePdf(clientUpdateHtml(p, text.trim(), await photoSources(p, ids), company, clientLang, recent.map((ph) => ph.id)), `Progress update — ${p.title}`);
      // The share sheet can't tell us whether it was really sent, so ask before counting it as the client's update.
      if (shared) {
        confirmAction('Did you send it to the client?', 'Then these photos count as seen, and the home screen reminds you again when there are new ones.', 'Yes, sent',
          () => updateProject(p.id, (x) => ({ ...x, lastClientUpdateAt: new Date().toISOString() })));
      }
    } catch {
      notify('Could not make the PDF', 'Try again.');
    } finally {
      setBusy(null);
    }
  };

  const pairW = Math.floor((Math.min(width, 760) - 32 - 32 - 8) / 2);
  const openTasks = p.rooms.filter((r) => rooms.includes(r.id)).reduce((t, r) => t + r.tasks.filter((x) => !x.done).length, 0);

  return (
    <Screen>
      <Stack.Screen options={{ title: mode === 'crew' ? 'Work order' : mode === 'client' ? 'Client update' : 'Facebook post' }} />
      <Segmented<Mode> value={mode} onChange={(m) => { setMode(m); setText(''); }}
        options={[{ value: 'crew', label: 'Crew' }, { value: 'client', label: 'Client' }, { value: 'post', label: 'Post' }]} />

      {mode === 'crew' ? (
        <Card>
          <H2>Work order for the crew</H2>
          <Muted style={{ fontSize: 13 }}>Photos with your drawings and notes, and the open tasks with check boxes. Prices never appear.</Muted>
          <Label>Rooms</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {p.rooms.map((r) => (
              <Chip key={r.id} label={r.name} selected={rooms.includes(r.id)}
                onPress={() => setRooms(rooms.includes(r.id) ? rooms.filter((x) => x !== r.id) : [...rooms, r.id])} />
            ))}
          </View>
          <Label>Language</Label>
          <Segmented<CrewLang> value={lang} onChange={setLang}
            options={(['en', 'vi', 'es'] as CrewLang[]).map((l) => ({ value: l, label: LANG_NAMES[l].native }))} />
          {lang !== 'en' ? <Muted style={{ fontSize: 13 }}>Bidwell translates the tasks; the English stays underneath in small type.</Muted> : null}
          {openTasks === 0 ? <Banner tone="info" title="No open tasks in these rooms">The PDF will only show the photos and notes.</Banner> : null}
          <Button title={busy === 'pdf' ? 'Making the PDF…' : 'Share work order PDF'} disabled={!!busy || !rooms.length} onPress={crewPdf} />
          <Button kind="secondary" title={busy === 'text' ? 'Preparing…' : 'Send tasks as a text message'} disabled={!!busy || !rooms.length} onPress={crewText} />
        </Card>
      ) : (
        <Card>
          <H2>{mode === 'client' ? 'Progress update for the client' : 'Post for your Facebook groups'}</H2>
          <Muted style={{ fontSize: 13 }}>
            {mode === 'client'
              ? 'What’s finished and what’s next, with before and after photos. No prices or internal notes.'
              : 'A short post about the finished work. Never the client’s name, address or prices.'}
          </Muted>
          <Segmented<'en' | 'vi'> value={clientLang} onChange={setClientLang} options={[{ value: 'en', label: 'English' }, { value: 'vi', label: 'Tiếng Việt' }]} />
          <Button kind="secondary" title={busy === 'write' ? 'Bidwell is writing…' : 'Write it with Bidwell'} disabled={!!busy} onPress={write} />
          <Field label={mode === 'client' ? 'Message' : 'Post'} multiline value={text} onChangeText={setText}
            placeholder={mode === 'client' ? 'Hi! Here’s where we are…' : 'Before and after: hall bath…'} />
          {mode === 'client' ? (
            <Button title={busy === 'pdf' ? 'Making the PDF…' : 'Share update PDF'} disabled={!!busy || !text.trim()} onPress={clientPdf} />
          ) : (
            <Button title="Share post text" disabled={!text.trim()} onPress={() => shareText(text.trim())} />
          )}
        </Card>
      )}

      {mode === 'client' ? (
        <Card>
          <H2>New photos for the client · {recent.length}</H2>
          <Muted style={{ fontSize: 13 }}>
            {recent.length
              ? `Taken ${p.lastClientUpdateAt ? 'since your last update' : 'in the last 7 days'}. They go in the update without your drawings or crew notes.`
              : 'No new photos since the last update. Take a few progress photos first: clients love seeing the work move.'}
          </Muted>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {recent.map((ph) => <PhotoView key={ph.id} photo={{ ...ph, markup: [] }} width={Math.floor((Math.min(width, 760) - 32 - 32 - 12) / 3)} />)}
          </View>
          {p.lastClientUpdateAt ? <Muted style={{ fontSize: 12 }}>Last update sent {new Date(p.lastClientUpdateAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.</Muted> : null}
        </Card>
      ) : null}

      {mode !== 'crew' ? (
        <Card>
          <H2>Before and after</H2>
          {pairs.length === 0 ? (
            <Muted style={{ fontSize: 13 }}>
              None yet. In a room, add Before photos, and an After photo when a task is done (or After photos for the room).
            </Muted>
          ) : pairs.map((x) => (
            <View key={`${x.before.id}-${x.after.id}`} style={{ gap: 4 }}>
              <Text style={{ fontWeight: '600', color: C.ink }}>{x.room} · {x.label}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[x.before, x.after].map((ph, i) => (
                  <Pressable key={ph.id} accessibilityRole="button" accessibilityLabel={`Share the ${i ? 'after' : 'before'} photo`} disabled={Platform.OS === 'web'}
                    onPress={() => Sharing.shareAsync(resolvePhotoUri(ph.uri), { mimeType: 'image/jpeg', UTI: 'public.jpeg' }).catch(() => notify('Could not share the photo'))}>
                    <PhotoView photo={ph} width={pairW} badge={i ? 'After' : 'Before'} />
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
          {pairs.length ? (
            <Muted style={{ fontSize: 13 }}>
              {Platform.OS === 'web' ? 'Attach these photos to your post.' : 'Tap a photo to save it to Photos or share it straight to Facebook or Messages. Drawings are not included.'}
            </Muted>
          ) : null}
        </Card>
      ) : null}
    </Screen>
  );
}
