import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { newId } from '@/engine/format';
import { beforeAfterPairs, contractLine, emptyRoom, projectProgress, roomProgress } from '@/engine/site';
import { useApp } from '@/store/AppContext';
import { Button, C, Card, Field, H2, Muted, Screen } from '@/ui/kit';
import { confirmAction } from '@/ui/notify';
import { PhotoView } from '@/ui/SitePhotoView';

export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { projects, estimates, updateProject, deleteProject, deletePhotosLater } = useApp();
  const [roomName, setRoomName] = useState('');
  const p = projects.find((x) => x.id === id);
  if (!p) {
    return (
      <Screen>
        <Muted>This project was deleted.</Muted>
        <Button title="Back to job sites" onPress={() => router.replace('/sites')} />
      </Screen>
    );
  }
  const pr = projectProgress(p);
  const est = estimates.find((e) => e.id === p.estimateId);
  const pairs = beforeAfterPairs(p);
  const go = (path: string) => router.push(`/site/${p.id}/${path}` as never);

  const addRoom = () => {
    const name = roomName.trim();
    if (!name) return;
    updateProject(p.id, (x) => ({ ...x, rooms: [...x.rooms, emptyRoom(newId(), name)] }));
    setRoomName('');
  };

  const remove = () =>
    confirmAction('Delete this project?', 'All its photos, tasks and logs are deleted from this phone. The estimate stays.', 'Delete', () => {
      deletePhotosLater(p.rooms.flatMap((r) => r.photos.map((ph) => ph.uri)));
      deleteProject(p.id);
      router.replace('/sites');
    });

  return (
    <Screen>
      <Stack.Screen options={{ title: p.title }} />
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 22, fontWeight: '700', color: C.ink }}>{p.title}</Text>
        <Muted>{[p.clientName, p.address].filter(Boolean).join(' · ') || 'No address yet'}</Muted>
        {est ? <Muted style={{ fontSize: 12 }}>{contractLine(est)} · internal, never on crew or client PDFs</Muted> : null}
      </View>

      <Card style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontWeight: '700', color: C.ink }}>{pr.done} of {pr.total} tasks done</Text>
          <Text style={{ fontWeight: '700', color: C.accent }}>{pr.pct}%</Text>
        </View>
        <View style={{ height: 8, borderRadius: 4, backgroundColor: C.line }}>
          <View style={{ width: `${pr.pct}%`, height: 8, borderRadius: 4, backgroundColor: C.accent }} />
        </View>
        <Muted style={{ fontSize: 13 }}>{pr.photos} photos · {pairs.length} before/after pair{pairs.length === 1 ? '' : 's'} · {p.logs.length} daily log{p.logs.length === 1 ? '' : 's'}</Muted>
      </Card>

      <H2>Rooms</H2>
      {p.rooms.map((r) => {
        const rp = roomProgress(r);
        const cover = r.photos[r.photos.length - 1];
        return (
          <Pressable key={r.id} accessibilityRole="button" onPress={() => go(`room/${r.id}`)}>
            <Card style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              {cover ? <PhotoView photo={cover} width={64} /> : (
                <View style={{ width: 64, height: 48, borderRadius: 8, backgroundColor: C.lineSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: C.muted, fontSize: 11 }}>No photos</Text>
                </View>
              )}
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontWeight: '700', color: C.ink, fontSize: 16 }}>{r.name}</Text>
                <Muted style={{ fontSize: 13 }}>{rp.total ? `${rp.done} of ${rp.total} tasks` : 'No tasks yet'} · {rp.photos} photo{rp.photos === 1 ? '' : 's'}</Muted>
              </View>
              <Text style={{ color: C.muted, fontSize: 20 }}>›</Text>
            </Card>
          </Pressable>
        );
      })}
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
        <Field label="Add a room" value={roomName} onChangeText={setRoomName} placeholder="e.g. Primary bath" style={{ flex: 1 }} maxLength={40} />
        <Button kind="secondary" title="Add" disabled={!roomName.trim()} onPress={addRoom} />
      </View>

      <H2>Share and records</H2>
      <Card style={{ gap: 10 }}>
        <ActionRow title="Work order for the crew" sub="PDF with photos, drawings and tasks, in English, Vietnamese or Spanish" onPress={() => go('share?mode=crew')} />
        <ActionRow title="Daily log" sub="Claude writes today’s log from your photos and finished tasks" onPress={() => go('log')} />
        <ActionRow title="Client update" sub="Progress and before/after photos, no prices or internal notes" onPress={() => go('share?mode=client')} />
        <ActionRow title="Facebook post" sub={pairs.length ? `From ${pairs.length} before/after pair${pairs.length === 1 ? '' : 's'}` : 'Add Before and After photos to a room first'} onPress={() => go('share?mode=post')} />
      </Card>

      <Button kind="secondary" title={p.status === 'active' ? 'Mark job finished' : 'Reopen job'}
        onPress={() => updateProject(p.id, (x) => ({ ...x, status: x.status === 'active' ? 'done' : 'active' }))} />
      <Pressable accessibilityRole="button" onPress={remove} style={{ alignSelf: 'center', padding: 12 }}>
        <Text style={{ color: '#B42318', fontWeight: '600' }}>Delete project</Text>
      </Pressable>
    </Screen>
  );
}

function ActionRow({ title, sub, onPress }: { title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontWeight: '700', color: C.ink }}>{title}</Text>
        <Muted style={{ fontSize: 13 }}>{sub}</Muted>
      </View>
      <Text style={{ color: C.muted, fontSize: 20 }}>›</Text>
    </Pressable>
  );
}
