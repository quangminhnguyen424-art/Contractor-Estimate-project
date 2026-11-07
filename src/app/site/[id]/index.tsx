import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';

import { Text } from '@/ui/text';
import { useToday } from '@/ui/useToday';
import { buyTotals, emptyMoney, projectBooks } from '@/engine/books';
import { money as moneyFmt, newId } from '@/engine/format';
import { dayLabel, upcoming } from '@/engine/schedule';
import { AREA_PRESETS, beforeAfterPairs, emptyRoom, localDay, projectProgress, roomProgress, type PhotoKind, type SitePhoto } from '@/engine/site';
import { useApp } from '@/store/AppContext';
import { Banner, Button, C, Card, Field, List, ListRow, Muted, Screen, Section, Segmented, Select } from '@/ui/kit';
import { PressScale, Progress } from '@/ui/motion';
import { confirmAction } from '@/ui/notify';
import { addSitePhotos, PhotoView } from '@/ui/SitePhotoView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { projects, estimates, events, updateProject, deleteProject, deletePhotosLater, contracts, profile } = useApp();
  const { width } = useWindowDimensions();
  const today = useToday();
  const [roomName, setRoomName] = useState('');
  const [adding, setAdding] = useState(false);
  const [shooting, setShooting] = useState(false);
  const [shootRoom, setShootRoom] = useState<string | null>(null);
  const [shootKind, setShootKind] = useState<PhotoKind>('progress');
  const insets = useSafeAreaInsets();
  const p = projects.find((x) => x.id === id);
  if (!p) {
    return (
      <Screen>
        <Muted>This project was deleted.</Muted>
        <Button title="Back to jobs" onPress={() => router.replace('/jobs')} />
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
      router.replace('/jobs');
    });

  const cover = p.rooms.flatMap((r) => r.photos).sort((x, y) => y.takenAt.localeCompare(x.takenAt))[0];
  const openTasks = pr.total - pr.done;
  const capture = async (camera: boolean) => {
    const room = p.rooms.find((r) => r.id === shootRoom) ?? p.rooms[0];
    if (!room) { setShooting(false); setAdding(true); return; }
    setShooting(false);
    const added = await addSitePhotos(camera, shootKind);
    if (added.length) updateProject(p.id, (x) => ({ ...x, rooms: x.rooms.map((r) => (r.id === room.id ? { ...r, photos: [...r.photos, ...added] } : r)) }));
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
    <Screen>
      <Stack.Screen options={{ title: '' }} />
      {/* Header like CompanyCam: newest photo, the job, the address. */}
      <View style={{ alignItems: 'center', gap: 6 }}>
        {cover ? (
          <View style={{ borderRadius: 22, overflow: 'hidden' }}><PhotoView photo={cover} width={120} /></View>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel="Take the first photo" onPress={() => setShooting(true)}
            style={{ width: 96, height: 96, borderRadius: 24, backgroundColor: C.accentTint, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="camera" size={34} color={C.accent} />
          </Pressable>
        )}
        <Text style={{ fontSize: 24, fontWeight: '700', color: C.ink, textAlign: 'center' }}>{p.title}</Text>
        <Muted style={{ textAlign: 'center' }}>{[p.clientName, p.address].filter(Boolean).join(' · ') || 'No address yet'}</Muted>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
          <View style={{ width: 120 }}><Progress value={pr.total ? pr.done / pr.total : 0} height={6} /></View>
          <Text style={{ color: C.ink2, fontSize: 13, fontWeight: '600' }}>{pr.pct}% done</Text>
        </View>
      </View>

      {/* Three numbers that matter, one tap each. */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Summary icon="checkmark-circle" color={C.accent} title="To-dos" sub={pr.total ? `${openTasks} left` : 'None yet'} onPress={() => (p.rooms[0] ? go(`room/${p.rooms[0].id}`) : setAdding(true))} />
        <Summary icon="document-text" color="#9333EA" title="Quote" sub={est ? `${moneyFmt(est.total)} · ${est.status === 'won' ? 'Won' : est.status === 'sent' ? 'Sent' : est.status === 'lost' ? 'Lost' : 'Draft'}` : 'Add an estimate'}
          onPress={() => router.push(est ? `/estimate/${est.id}` : '/new')} />
        <Summary icon="cash" color={C.okInk} title="Money" sub={money && p.money?.costs.length ? `${money.profit.marginPct}% profit` : 'Track costs'} onPress={() => go('money')} />
      </View>

      {pr.photos ? (
        <Pressable accessibilityRole="button" onPress={() => go('share?mode=client')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.infoBg, borderRadius: 20, padding: 16 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: C.ink, fontWeight: '700', fontSize: 16 }}>Send the client a photo update</Text>
            <Text style={{ color: C.ink2, fontSize: 13 }}>{p.lastClientUpdateAt ? `Last sent ${new Date(p.lastClientUpdateAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Bidwell writes the message for you'}</Text>
          </View>
          <View style={{ backgroundColor: C.accent, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 }}>
            <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>Start</Text>
          </View>
        </Pressable>
      ) : null}

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
          <Select<string> label="Or pick a common one" value={null} placeholder="Kitchen, Siding, Roof…" onChange={(n) => { addRoom(n); setAdding(false); }}
            options={AREA_PRESETS.flatMap((g) => g.names.filter((n) => n === 'Repair spot' || !p.rooms.some((r) => r.name.toLowerCase() === n.toLowerCase()))
              .map((n) => ({ value: n, label: n, sub: g.group })))} />
        </Card>
      ) : null}

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

      <Section title="More" />
      <List>
        {est ? <ListRow icon="wallet" title="Contract & payments" sub="Signature, change orders, invoices" onPress={() => router.push(`/estimate/${est.id}/contract`)} /> : null}
        <ListRow icon="cart" title="Buy list" sub={buy.count ? `${buy.boughtCount} of ${buy.count} bought` : 'Materials from the estimate'} onPress={() => go('buy')} />
        <ListRow icon="calendar" title="Schedule a visit" sub={nextVisit ? `Next: ${dayLabel(nextVisit.date, today)}` : 'Crew day, inspection, walkthrough'} onPress={() => router.push(`/event?project=${p.id}`)} />
        <ListRow icon="people" title="Crew work order" sub="English, Tiếng Việt, Español · no prices" onPress={() => go('share?mode=crew')} />
        <ListRow icon="logo-facebook" title="Facebook post" sub={pairs.length ? `${pairs.length} before/after pair${pairs.length > 1 ? 's' : ''} ready` : 'Needs a before and an after photo'} onPress={() => go('share?mode=post')} />
        <ListRow icon={p.status === 'active' ? 'checkmark-done' : 'refresh'} title={p.status === 'active' ? 'Mark job finished' : 'Reopen job'}
          onPress={() => updateProject(p.id, (x) => ({ ...x, status: x.status === 'active' ? 'done' : 'active' }))} />
        <ListRow icon="trash" title="Delete project" danger onPress={remove} />
      </List>
      <View style={{ height: 96 }} />
    </Screen>

    {/* Floating bar like CompanyCam: daily log, a big camera, and Bidwell's AI. */}
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 12, alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 40, padding: 8,
        shadowColor: '#0B1324', shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Daily log" onPress={() => go('log')}
          style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: C.cardHi, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="chatbox-ellipses-outline" size={24} color={C.ink} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Take photos" onPress={() => setShooting(true)}
          style={{ width: 120, height: 56, borderRadius: 28, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="camera" size={26} color="#FFFFFF" />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Photo update with AI" onPress={() => go('share?mode=client')}
          style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: C.cardHi, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="sparkles" size={24} color="#7C3AED" />
        </Pressable>
      </View>
    </View>

    {/* Where the new photos go: pick the area and before / progress / after, then the camera opens. */}
    {shooting ? (
      <Pressable accessibilityLabel="Close" onPress={() => setShooting(false)} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(11,19,36,0.45)', justifyContent: 'flex-end' }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: C.card, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: insets.bottom + 20, gap: 14 }}>
          <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: C.line }} />
          <Text style={{ color: C.ink, fontSize: 20, fontWeight: '700' }}>Take photos</Text>
          {p.rooms.length ? (
            <>
              <Select<string> label="Which area?" value={shootRoom ?? p.rooms[0].id} onChange={setShootRoom}
                options={p.rooms.map((r) => ({ value: r.id, label: r.name, sub: `${r.photos.length} photo${r.photos.length === 1 ? '' : 's'}` }))} />
              <Text style={{ color: C.ink2, fontWeight: '600' }}>What kind?</Text>
              <Segmented<PhotoKind> value={shootKind} onChange={setShootKind}
                options={[{ value: 'before', label: 'Before' }, { value: 'progress', label: 'Progress' }, { value: 'after', label: 'After' }]} />
              <Button title="Open camera" icon="camera" onPress={() => capture(true)} />
              <Button kind="secondary" title="Choose from library" icon="images-outline" onPress={() => capture(false)} />
            </>
          ) : (
            <>
              <Text style={{ color: C.ink2 }}>Add an area first (a room, the siding, a repair spot) so every photo has a place.</Text>
              <Button title="Add an area" icon="add" onPress={() => { setShooting(false); setAdding(true); }} />
            </>
          )}
        </Pressable>
      </Pressable>
    ) : null}
    </View>
  );
}

/** One of the three summary tiles under the job title. */
function Summary({ icon, color, title, sub, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; color: string; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}: ${sub}`} onPress={onPress}
      style={({ pressed }) => ({ flex: 1, backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.line, padding: 12, gap: 8, opacity: pressed ? 0.8 : 1 })}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: `${color}1A`, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <View>
        <Text style={{ color: C.ink, fontSize: 15, fontWeight: '700' }} numberOfLines={1}>{title}</Text>
        <Text style={{ color: C.muted, fontSize: 12 }} numberOfLines={1}>{sub}</Text>
      </View>
    </Pressable>
  );
}
