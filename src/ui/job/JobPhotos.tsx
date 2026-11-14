import { dateLocale } from '@/engine/locale';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';

import { newId } from '@/engine/format';
import { dayLabel } from '@/engine/schedule';
import { AREA_PRESETS, beforeAfterPairs, emptyRoom, localDay, projectProgress, roomProgress, type PhotoKind, type SitePhoto, type SiteProject } from '@/engine/site';
import { useApp } from '@/store/AppContext';

import { Banner, Button, Card, Empty, Field, List, ListRow, Muted, Section, Segmented, Select } from '../kit';
import { PressScale, Progress } from '../motion';
import { PhotoView } from '../SitePhotoView';
import { Text } from '../text';
import { C } from '../theme';
import { useToday } from '../useToday';

/** The job site: photos by area, to-dos, and what to send the crew and the client. */
export function JobPhotos({ project, onStart }: {
  project?: SiteProject;
  /** No job site yet: make one (the first photo needs somewhere to go). */
  onStart: () => void;
}) {
  const { updateProject } = useApp();
  const { width } = useWindowDimensions();
  const today = useToday();
  const [adding, setAdding] = useState(false);
  const [roomName, setRoomName] = useState('');

  if (!project) {
    return <Empty art="jobs" title="No photos yet" text="Keep before, progress and after photos by area. Your crew gets a work order from them, and the client gets updates."
      action="Take the first photos" onAction={onStart} />;
  }
  const p = project;
  const go = (path: string) => router.push(`/site/${p.id}/${path}` as never);
  const pr = projectProgress(p);
  const pairs = beforeAfterPairs(p);
  const reviewCount = p.rooms.reduce((t, r) => t + r.tasks.filter((x) => x.review).length, 0);
  const thumb = Math.floor((Math.min(width, 760) - 32 - 12) / 3);
  // All photos by the day they were taken, newest first (like a feed).
  const byDay = new Map<string, { ph: SitePhoto; rid: string }[]>();
  for (const r of p.rooms) for (const ph of r.photos) {
    const d = localDay(ph.takenAt);
    byDay.set(d, [...(byDay.get(d) ?? []), { ph, rid: r.id }]);
  }
  const timeline = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 10)
    .map(([d, list]) => [d, list.sort((a, b) => b.ph.takenAt.localeCompare(a.ph.takenAt))] as const);

  const addRoom = (typed?: string) => {
    const name = (typed ?? roomName).trim();
    if (!name) return;
    // A second "Repair spot" gets a number so every area keeps its own photos.
    const taken = new Set(p.rooms.map((r) => r.name.toLowerCase()));
    let unique = name;
    for (let n = 2; taken.has(unique.toLowerCase()); n++) unique = `${name} ${n}`;
    updateProject(p.id, (x) => ({ ...x, rooms: [...x.rooms, emptyRoom(newId(), unique)] }));
    setRoomName('');
    setAdding(false);
  };

  return (
    <>
      {pr.total ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}><Progress value={pr.done / pr.total} height={8} /></View>
          <Text style={{ color: C.ink2, fontSize: 13, fontWeight: '600' }}>{pr.done} of {pr.total} to-dos done</Text>
        </View>
      ) : null}
      {reviewCount ? <Banner tone="warn" title={`${reviewCount} task${reviewCount > 1 ? 's' : ''} flagged: needs a look`} /> : null}

      <Section title="Areas" link={adding ? 'Close' : '+ Add area'} onLink={() => setAdding((v) => !v)} />
      {adding ? (
        <Card>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
            <Field label="Name" value={roomName} onChangeText={setRoomName} placeholder="e.g. Primary bath, Siding" style={{ flex: 1 }} maxLength={40} />
            <Button title="Add" disabled={!roomName.trim()} onPress={() => addRoom()} />
          </View>
          <Select<string> label="Or pick a common one" value={null} placeholder="Kitchen, Siding, Roof…" onChange={(n) => addRoom(n)}
            options={AREA_PRESETS.flatMap((g) => g.names.filter((n) => n === 'Repair spot' || !p.rooms.some((r) => r.name.toLowerCase() === n.toLowerCase()))
              .map((n) => ({ value: n, label: n, sub: g.group })))} />
        </Card>
      ) : null}
      {p.rooms.length ? (
        <List>
          {p.rooms.map((r) => {
            const rp = roomProgress(r);
            const cover = r.photos[r.photos.length - 1];
            return (
              <Pressable key={r.id} accessibilityRole="button" accessibilityLabel={r.name} onPress={() => go(`room/${r.id}`)}
                style={({ pressed }) => ({ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 12, backgroundColor: pressed ? C.cardHi : 'transparent' })}>
                {cover ? <View style={{ borderRadius: 10, overflow: 'hidden' }}><PhotoView photo={cover} width={60} /></View> : (
                  <View style={{ width: 60, height: 45, borderRadius: 10, backgroundColor: C.cardHi, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="camera-outline" size={20} color={C.muted} />
                  </View>
                )}
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontWeight: '600', color: C.ink, fontSize: 16 }}>{r.name}</Text>
                  <Muted style={{ fontSize: 13 }}>{rp.photos} photo{rp.photos === 1 ? '' : 's'}{rp.total ? ` · ${rp.done}/${rp.total} to-dos done` : ' · add to-dos for the crew'}</Muted>
                </View>
                <Ionicons name="chevron-forward" size={16} color={C.muted} />
              </Pressable>
            );
          })}
        </List>
      ) : (
        <Muted>Add an area first (a room, the siding, a repair spot) so every photo has a place.</Muted>
      )}

      {timeline.length ? (
        <>
          <Section title={`Photos (${pr.photos})`} />
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

      <Section title="Share" />
      <List>
        <ListRow icon="images" title="Photo update for the client"
          sub={p.lastClientUpdateAt ? `Last sent ${new Date(p.lastClientUpdateAt).toLocaleDateString(dateLocale(), { month: 'short', day: 'numeric' })}` : 'Bidwell writes the message for you'}
          onPress={() => go('share?mode=client')} />
        <ListRow icon="people" title="Work order for the crew" sub="In each person’s language · never shows prices" onPress={() => go('share?mode=crew')} />
        <ListRow icon="book" title="Daily log" sub={p.logs.length ? `${p.logs.length} day${p.logs.length > 1 ? 's' : ''} written` : 'What got done today, in one tap'} onPress={() => go('log')} />
        <ListRow icon="logo-facebook" title="Before and after post" sub={pairs.length ? `${pairs.length} pair${pairs.length > 1 ? 's' : ''} ready` : 'Needs a before and an after photo'} onPress={() => go('share?mode=post')} />
      </List>
    </>
  );
}

/** Where the new photos go: pick the area and before / progress / after, then the camera opens. */
export function TakePhotos({ project, onClose, onCapture }: {
  project: SiteProject; onClose: () => void; onCapture: (roomId: string, kind: PhotoKind, camera: boolean) => void;
}) {
  const [room, setRoom] = useState<string | null>(null);
  const [kindPicked, setKind] = useState<PhotoKind | null>(null);
  const roomId = room ?? project.rooms[0]?.id;
  // An area with no photos yet starts with its "before"; after that, progress.
  const kind: PhotoKind = kindPicked ?? (project.rooms.find((r) => r.id === roomId)?.photos.length ? 'progress' : 'before');
  return (
    <>
      <Select<string> label="Which area?" value={roomId} onChange={setRoom}
        options={project.rooms.map((r) => ({ value: r.id, label: r.name, sub: `${r.photos.length} photo${r.photos.length === 1 ? '' : 's'}` }))} />
      <Text style={{ color: C.ink2, fontWeight: '600' }}>What kind?</Text>
      <Segmented<PhotoKind> value={kind} onChange={setKind}
        options={[{ value: 'before', label: 'Before' }, { value: 'progress', label: 'Progress' }, { value: 'after', label: 'After' }]} />
      <Button title="Open camera" icon="camera" onPress={() => { if (roomId) onCapture(roomId, kind, true); }} />
      <Button kind="secondary" title="Choose from library" icon="images-outline" onPress={() => { if (roomId) onCapture(roomId, kind, false); }} />
      <Button kind="ghost" title="Cancel" onPress={onClose} />
    </>
  );
}
