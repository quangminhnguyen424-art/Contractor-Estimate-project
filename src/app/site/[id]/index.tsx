import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';

import { Text } from '@/ui/text';
import { useToday } from '@/ui/useToday';
import { buyTotals, emptyMoney, projectBooks } from '@/engine/books';
import { money as moneyFmt, newId } from '@/engine/format';
import { dayLabel, upcoming } from '@/engine/schedule';
import { AREA_PRESETS, beforeAfterPairs, emptyRoom, localDay, projectProgress, roomProgress, type SitePhoto } from '@/engine/site';
import { useApp } from '@/store/AppContext';
import { Action, Banner, Button, C, Card, Chip, Field, List, ListRow, Muted, Screen, Section } from '@/ui/kit';
import { PressScale, Progress } from '@/ui/motion';
import { confirmAction } from '@/ui/notify';
import { PhotoView } from '@/ui/SitePhotoView';

export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { projects, estimates, events, updateProject, deleteProject, deletePhotosLater, contracts, profile } = useApp();
  const { width } = useWindowDimensions();
  const today = useToday();
  const [roomName, setRoomName] = useState('');
  const [adding, setAdding] = useState(false);
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
  const money = p.money?.costs.length || est ? projectBooks({ est, profile, contract: contracts.find((c) => c.estimateId === p.estimateId), money: p.money ?? emptyMoney(), today }) : null;
  const buy = buyTotals(p.money?.buy ?? []);
  const go = (path: string) => router.push(`/site/${p.id}/${path}` as never);
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

  const addRoom = (typed?: string) => {
    const name = (typed ?? roomName).trim();
    if (!name) return;
    // A second "Repair spot" gets a number so every area keeps its own photos.
    const taken = new Set(p.rooms.map((r) => r.name.toLowerCase()));
    let unique = name;
    for (let n = 2; taken.has(unique.toLowerCase()); n++) unique = `${name} ${n}`;
    updateProject(p.id, (x) => ({ ...x, rooms: [...x.rooms, emptyRoom(newId(), unique)] }));
    if (typed == null) setRoomName('');
  };
  const reviewCount = p.rooms.reduce((t, r) => t + r.tasks.filter((x) => x.review).length, 0);

  const remove = () =>
    confirmAction('Delete this project?', 'All its photos, tasks and logs are deleted from this phone. The estimate stays.', 'Delete', () => {
      deletePhotosLater([...p.rooms.flatMap((r) => r.photos.map((ph) => ph.uri)), ...(p.money?.costs.flatMap((c) => (c.receiptUri ? [c.receiptUri] : [])) ?? [])]);
      deleteProject(p.id);
      router.replace('/sites');
    });

  return (
    <Screen>
      <Stack.Screen options={{ title: p.title }} />
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 22, fontWeight: '700', color: C.ink }}>{p.title}</Text>
        <Muted>{[p.clientName, p.address].filter(Boolean).join(' · ') || 'No address yet'}</Muted>
      </View>

      {/* Progress in one line. */}
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: C.ink2, fontSize: 14 }}>{pr.total ? `${pr.done} of ${pr.total} tasks done` : 'No tasks yet'} · {pr.photos} photo{pr.photos === 1 ? '' : 's'}</Text>
          <Text style={{ fontWeight: '700', color: C.accent }}>{pr.pct}%</Text>
        </View>
        <Progress value={pr.total ? pr.done / pr.total : 0} />
      </View>

      {/* The things done most often on a job, one tap each. */}
      <View style={{ flexDirection: 'row', gap: 4 }}>
        <Action icon="send" label="Photo update" onPress={() => go('share?mode=client')} />
        <Action icon="book" label="Daily log" onPress={() => go('log')} />
        <Action icon="people" label="Work order" onPress={() => go('share?mode=crew')} />
        <Action icon="calendar" label="Schedule" badge={!!nextVisit} onPress={() => router.push(`/event?project=${p.id}`)} />
      </View>

      {/* Photos by area (like CompanyCam): the heart of the job. */}
      <Section title="Areas" />
      {reviewCount ? <Banner tone="warn" title={`${reviewCount} task${reviewCount > 1 ? 's' : ''} flagged: needs a look`} /> : null}
      <List>
        {p.rooms.map((r) => {
          const rp = roomProgress(r);
          const cover = r.photos[r.photos.length - 1];
          return (
            <Pressable key={r.id} accessibilityRole="button" onPress={() => go(`room/${r.id}`)}
              style={({ pressed }) => ({ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 12, backgroundColor: pressed ? C.cardHi : 'transparent' })}>
              {cover ? <View style={{ borderRadius: 10, overflow: 'hidden' }}><PhotoView photo={cover} width={60} /></View> : (
                <View style={{ width: 60, height: 45, borderRadius: 10, backgroundColor: C.cardHi, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="camera-outline" size={20} color={C.muted} />
                </View>
              )}
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontWeight: '600', color: C.ink, fontSize: 16 }}>{r.name}</Text>
                <Muted style={{ fontSize: 13 }}>{rp.photos} photo{rp.photos === 1 ? '' : 's'}{rp.total ? ` · ${rp.done}/${rp.total} done` : ''}</Muted>
              </View>
              <Ionicons name="chevron-forward" size={16} color={C.muted} />
            </Pressable>
          );
        })}
        <Pressable accessibilityRole="button" onPress={() => setAdding((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 }}>
          <Ionicons name={adding ? 'close-circle' : 'add-circle'} size={22} color={C.accent} />
          <Text style={{ color: C.accent, fontWeight: '600', fontSize: 15 }}>{adding ? 'Close' : 'Add an area'}</Text>
        </Pressable>
      </List>
      {adding ? (
        <Card>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
            <Field label="Name" value={roomName} onChangeText={setRoomName} placeholder="e.g. Primary bath, Siding" style={{ flex: 1 }} maxLength={40} />
            <Button title="Add" disabled={!roomName.trim()} onPress={() => { addRoom(); setAdding(false); }} />
          </View>
          {AREA_PRESETS.map((g) => (
            <View key={g.group} style={{ gap: 6 }}>
              <Muted style={{ fontSize: 12 }}>{g.group}</Muted>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {g.names.filter((n) => n === 'Repair spot' || !p.rooms.some((r) => r.name.toLowerCase() === n.toLowerCase())).map((n) => (
                  <Chip key={n} label={`+ ${n}`} onPress={() => { addRoom(n); setAdding(false); }} />
                ))}
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      {/* Money and paperwork: private to the contractor. */}
      <Section title="Money & paperwork" />
      <List>
        {est ? <ListRow icon="document-text" title="Contract & payments" sub="Signature, change orders, invoices" onPress={() => router.push(`/estimate/${est.id}/contract`)} /> : null}
        <ListRow icon="cash" title="Job money" sub={money && p.money?.costs.length ? `Profit ${moneyFmt(money.profit.amount)} · ${money.profit.marginPct}%` : 'Costs, receipts, profit'} onPress={() => go('money')} />
        <ListRow icon="cart" title="Buy list" sub={buy.count ? `${buy.boughtCount} of ${buy.count} bought` : 'Materials from the estimate'} onPress={() => go('buy')} />
      </List>

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

      <Section title="More" />
      <List>
        <ListRow icon="logo-facebook" title="Facebook post" sub={pairs.length ? `${pairs.length} before/after pair${pairs.length > 1 ? 's' : ''} ready` : 'Needs a before and an after photo'} onPress={() => go('share?mode=post')} />
        <ListRow icon={p.status === 'active' ? 'checkmark-done' : 'refresh'} title={p.status === 'active' ? 'Mark job finished' : 'Reopen job'}
          onPress={() => updateProject(p.id, (x) => ({ ...x, status: x.status === 'active' ? 'done' : 'active' }))} />
        <ListRow icon="trash" title="Delete project" danger onPress={remove} />
      </List>
    </Screen>
  );
}
