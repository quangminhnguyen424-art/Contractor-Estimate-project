import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, useWindowDimensions, View } from 'react-native';

import { newId } from '@/engine/format';
import type { PhotoKind, SiteRoom, SiteTask } from '@/engine/site';
import { stepsFor } from '@/engine/siteAI';
import { useApp } from '@/store/AppContext';
import { aiFor } from '@/ui/host';
import { Button, C, Card, Field, H2, Muted, Screen, Segmented } from '@/ui/kit';
import { confirmAction, notify } from '@/ui/notify';
import { toAiImages } from '@/ui/photos';
import { readablePhotoUri } from '@/ui/photoStore';
import { addSitePhotos, KIND_LABEL, PhotoView } from '@/ui/SitePhotoView';

/** One room: photos with drawings and notes, the room's instructions, and the crew's task list. */
export default function RoomScreen() {
  const { id, roomId } = useLocalSearchParams<{ id: string; roomId: string }>();
  const { projects, updateProject, apiKey, deletePhotosLater } = useApp();
  const { width } = useWindowDimensions();
  const p = projects.find((x) => x.id === id);
  const room = p?.rooms.find((r) => r.id === roomId);
  const [name, setName] = useState(room?.name ?? '');
  const [notes, setNotes] = useState(room?.notes ?? '');
  const [kind, setKind] = useState<PhotoKind>('before');
  const [newTask, setNewTask] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  if (!p || !room) return <Screen><Muted>This room was deleted.</Muted></Screen>;
  const thumb = Math.floor((Math.min(width, 760) - 32 - 16) / 3);
  const setRoom = (fn: (r: SiteRoom) => SiteRoom) =>
    updateProject(p.id, (x) => ({ ...x, rooms: x.rooms.map((r) => (r.id === room.id ? fn(r) : r)) }));
  const setTask = (taskId: string, patch: Partial<SiteTask>) =>
    setRoom((r) => ({ ...r, tasks: r.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)) }));

  const addPhotos = async (camera: boolean) => {
    setBusy('photos');
    const added = await addSitePhotos(camera, kind);
    setBusy(null);
    if (added.length) setRoom((r) => ({ ...r, photos: [...r.photos, ...added] }));
  };

  const makeSteps = async () => {
    if (!notes.trim() && !room.photos.some((ph) => ph.note.trim()) && room.photos.length === 0) {
      return notify('Add instructions first', 'Write or say what needs doing in this room, or add photos with notes.');
    }
    setBusy('steps');
    try {
      const forAi = { ...room, notes };
      const roomId = room.id;
      const uris = await Promise.all(room.photos.slice(0, 8).map(async (ph) => (await readablePhotoUri(ph.uri)) ?? ''));
      const { images } = await toAiImages(uris, 8);
      const steps = await stepsFor(aiFor(apiKey), forAi, p, images);
      if (!steps.length) notify('No tasks found', 'Add more detail to the notes and try again.');
      // Only adds tasks: anything typed while Claude was working is already saved and stays as it is.
      else updateProject(p.id, (x) => ({
        ...x, rooms: x.rooms.map((r) => (r.id === roomId ? { ...r, tasks: [...r.tasks, ...steps.map((text) => ({ id: newId(), text, done: false }))] } : r)),
      }));
    } catch (e) {
      notify('Claude could not make the list', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(null);
    }
  };

  const addAfter = async (task: SiteTask) => {
    setBusy(task.id);
    const added = await addSitePhotos(true, 'after');
    setBusy(null);
    if (!added.length) return;
    const ph = { ...added[0], note: task.text };
    setRoom((r) => ({
      ...r, photos: [...r.photos, ph],
      tasks: r.tasks.map((t) => (t.id === task.id ? { ...t, afterPhotoId: ph.id, done: true, doneAt: t.doneAt ?? new Date().toISOString() } : t)),
    }));
  };

  const open = room.tasks.filter((t) => !t.done);
  const done = room.tasks.filter((t) => t.done);
  const photoById = new Map(room.photos.map((ph) => [ph.id, ph]));

  const taskRow = (t: SiteTask) => {
    const before = t.photoId ? photoById.get(t.photoId) : undefined;
    const after = t.afterPhotoId ? photoById.get(t.afterPhotoId) : undefined;
    return (
      <View key={t.id} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 8, borderTopWidth: 1, borderColor: C.lineSoft }}>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: t.done }} accessibilityLabel={t.text} hitSlop={8}
          onPress={() => setTask(t.id, t.done ? { done: false, doneAt: undefined } : { done: true, doneAt: new Date().toISOString() })}
          style={{ width: 26, height: 26, borderRadius: 6, borderWidth: 2, borderColor: t.done ? C.okInk : C.ink2, backgroundColor: t.done ? C.okInk : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
          {t.done ? <Text style={{ color: '#fff', fontWeight: '800' }}>✓</Text> : null}
        </Pressable>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={{ color: t.done ? C.muted : C.ink, fontSize: 15, textDecorationLine: t.done ? 'line-through' : 'none' }}>{t.text}</Text>
          {before || after ? (
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {before ? <PhotoView photo={before} width={72} badge="Where" /> : null}
              {after ? <PhotoView photo={after} width={72} badge="After" /> : null}
            </View>
          ) : null}
          {!after ? (
            <Pressable accessibilityRole="button" onPress={() => addAfter(t)} disabled={!!busy}>
              <Text style={{ color: C.accent, fontWeight: '600', fontSize: 13 }}>{busy === t.id ? 'Saving…' : '+ After photo'}</Text>
            </Pressable>
          ) : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Delete task ${t.text}`} hitSlop={8}
          onPress={() => confirmAction('Delete this task?', t.text, 'Delete', () => setRoom((r) => ({ ...r, tasks: r.tasks.filter((x) => x.id !== t.id) })))}>
          <Text style={{ color: C.muted, fontSize: 18 }}>×</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: room.name }} />
      <Field label="Room" value={name} maxLength={40}
        onChangeText={(v) => { setName(v); if (v.trim()) setRoom((r) => ({ ...r, name: v.trim() })); }}
        onBlur={() => { if (!name.trim()) setName(room.name); }} />

      <Card>
        <H2>Photos</H2>
        <Muted style={{ fontSize: 13 }}>Tap a photo to draw arrows, circles and measurements, and write what to do there.</Muted>
        <Segmented<PhotoKind> value={kind} onChange={setKind}
          options={(['before', 'progress', 'after'] as PhotoKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button kind="secondary" title="Take photo" style={{ flex: 1 }} disabled={!!busy} onPress={() => addPhotos(true)} />
          <Button kind="secondary" title="From library" style={{ flex: 1 }} disabled={!!busy} onPress={() => addPhotos(false)} />
        </View>
        {busy === 'photos' ? <ActivityIndicator color={C.accent} /> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {room.photos.map((ph, i) => (
            <Pressable key={ph.id} accessibilityRole="button" accessibilityLabel={`Photo ${i + 1}, ${KIND_LABEL[ph.kind]}`}
              onPress={() => router.push(`/site/${p.id}/photo/${ph.id}?room=${room.id}` as never)}>
              <PhotoView photo={ph} width={thumb} badge={`${i + 1} · ${KIND_LABEL[ph.kind]}`} />
            </Pressable>
          ))}
        </View>
      </Card>

      <Card>
        <H2>Instructions for this room</H2>
        <Field label="What needs doing" multiline value={notes}
          onChangeText={(v) => { setNotes(v); setRoom((r) => ({ ...r, notes: v })); }}
          placeholder="e.g. Demo vanity and tile to studs. Move the outlet 12 in left, box at 44 in AFF. New fan vented outside."
          help="Tap the microphone on your keyboard to talk. Claude turns this and your photo notes into tasks." />
        <Button title={busy === 'steps' ? 'Claude is writing the tasks…' : 'Make task list with Claude'} disabled={!!busy} onPress={makeSteps} />
      </Card>

      <Card style={{ gap: 4 }}>
        <H2>Tasks{room.tasks.length ? ` · ${done.length} of ${room.tasks.length} done` : ''}</H2>
        {room.tasks.length === 0 ? <Muted style={{ fontSize: 13 }}>No tasks yet. Make them with Claude above, or add your own.</Muted> : null}
        {open.map(taskRow)}
        {done.map(taskRow)}
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end', marginTop: 6 }}>
          <Field label="Add a task" value={newTask} onChangeText={setNewTask} style={{ flex: 1 }} maxLength={300} placeholder="e.g. Install GFCI at vanity" />
          <Button kind="secondary" title="Add" disabled={!newTask.trim()}
            onPress={() => { setRoom((r) => ({ ...r, tasks: [...r.tasks, { id: newId(), text: newTask.trim(), done: false }] })); setNewTask(''); }} />
        </View>
      </Card>

      <Button title="Send this room to the crew" onPress={() => router.push(`/site/${p.id}/share?mode=crew&room=${room.id}` as never)} />
      <Pressable accessibilityRole="button" style={{ alignSelf: 'center', padding: 12 }}
        onPress={() => confirmAction('Delete this room?', 'Its photos and tasks are deleted.', 'Delete', () => {
          updateProject(p.id, (x) => ({ ...x, rooms: x.rooms.filter((r) => r.id !== room.id) }));
          deletePhotosLater(room.photos.map((ph) => ph.uri));
          router.back();
        })}>
        <Text style={{ color: '#B42318', fontWeight: '600' }}>Delete room</Text>
      </Pressable>
    </Screen>
  );
}
