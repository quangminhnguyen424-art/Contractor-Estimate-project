import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';

import { Text } from '@/ui/text';
import { newId } from '@/engine/format';
import { dayLabel, upcoming } from '@/engine/schedule';
import { beforeAfterPairs, contractLine, emptyRoom, localDay, projectProgress, roomProgress, type SitePhoto } from '@/engine/site';
import { useApp } from '@/store/AppContext';
import { Button, C, Card, Field, H2, Muted, Screen, Section, Tile } from '@/ui/kit';
import { PressScale, Progress } from '@/ui/motion';
import { confirmAction } from '@/ui/notify';
import { PhotoView } from '@/ui/SitePhotoView';

export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { projects, estimates, events, updateProject, deleteProject, deletePhotosLater } = useApp();
  const { width } = useWindowDimensions();
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
  const today = localDay();
  const nextVisit = upcoming(events.filter((e) => e.projectId === p.id), today, 60)[0];
  const thumb = Math.floor((Math.min(width, 760) - 32 - 12) / 3);
  // All photos by the day they were taken, newest first (like a feed).
  const byDay = new Map<string, { ph: SitePhoto; rid: string }[]>();
  for (const r of p.rooms) for (const ph of r.photos) {
    const d = localDay(ph.takenAt);
    byDay.set(d, [...(byDay.get(d) ?? []), { ph, rid: r.id }]);
  }
  const timeline = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 10)
    .map(([d, list]) => [d, list.sort((a, b) => b.ph.takenAt.localeCompare(a.ph.takenAt))] as const);

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

      <Card style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontWeight: '700', color: C.ink }}>{pr.done} of {pr.total} tasks done</Text>
          <Text style={{ fontWeight: '800', color: C.accent }}>{pr.pct}%</Text>
        </View>
        <Progress value={pr.total ? pr.done / pr.total : 0} />
        <Muted style={{ fontSize: 13 }}>{pr.photos} photos · {pairs.length} before/after pair{pairs.length === 1 ? '' : 's'} · {p.logs.length} daily log{p.logs.length === 1 ? '' : 's'}</Muted>
      </Card>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <Tile index={0} icon="images-outline" tone="sky" title="Photo update" sub={p.lastClientUpdateAt ? `Last sent ${new Date(p.lastClientUpdateAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Send the client new photos'} onPress={() => go('share?mode=client')} />
        <Tile index={1} icon="people-outline" title="Crew work order" sub="EN · VI · ES, no prices" onPress={() => go('share?mode=crew')} />
        <Tile index={2} icon="book-outline" tone="slate" title="Daily log" sub="Claude writes it for you" onPress={() => go('log')} />
        <Tile index={3} icon="calendar-outline" tone="sky" title="Schedule" sub={nextVisit ? `Next: ${dayLabel(nextVisit.date, today)}` : 'Crew day, inspection…'} onPress={() => router.push(`/event?project=${p.id}`)} />
        {est ? <Tile index={4} icon="wallet-outline" title="Contract & payments" sub="Sign, change orders, invoices" onPress={() => router.push(`/estimate/${est.id}/contract`)} /> : null}
        <Tile index={5} icon="logo-facebook" tone="slate" title="Facebook post" sub={pairs.length ? `${pairs.length} before/after` : 'Needs before + after'} onPress={() => go('share?mode=post')} />
      </View>

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

      {timeline.length ? (
        <>
          <Section title="Photo timeline" />
          {timeline.map(([day, list]) => (
            <View key={day} style={{ gap: 6 }}>
              <Text style={{ color: C.muted, fontSize: 13, fontWeight: '600' }}>{dayLabel(day, today)} · {list.length} photo{list.length > 1 ? 's' : ''}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {list.map(({ ph, rid }) => (
                  <PressScale key={ph.id} accessibilityRole="button" accessibilityLabel="Open photo" onPress={() => go(`photo/${ph.id}?room=${rid}`)}>
                    <PhotoView photo={ph} width={thumb} />
                  </PressScale>
                ))}
              </View>
            </View>
          ))}
        </>
      ) : null}

      <Button kind="secondary" title={p.status === 'active' ? 'Mark job finished' : 'Reopen job'}
        onPress={() => updateProject(p.id, (x) => ({ ...x, status: x.status === 'active' ? 'done' : 'active' }))} />
      <Pressable accessibilityRole="button" onPress={remove} style={{ alignSelf: 'center', padding: 12 }}>
        <Text style={{ color: C.danger, fontWeight: '600' }}>Delete project</Text>
      </Pressable>
    </Screen>
  );
}
