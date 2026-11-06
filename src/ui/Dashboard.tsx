import { dailyCheckIn } from '@/engine/pm';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';

import { contractTotals, invoiceStates } from '@/engine/contract';
import { money } from '@/engine/format';
import { KINDS, timeLabel, upcoming } from '@/engine/schedule';
import type { SitePhoto } from '@/engine/site';
import { useCloud } from '@/cloud/CloudProvider';
import { useApp } from '@/store/AppContext';

import { Button, C, Card, Section } from './kit';
import { PressScale, Reveal, Shine } from './motion';
import { PhotoView } from './SitePhotoView';
import { Text } from './text';
import { useToday } from './useToday';

const DAY = 86400000;

/** Jobs whose client hasn't seen new photos in a while (photos taken since the last update, or never updated). */
export function staleUpdates(projects: ReturnType<typeof useApp>['projects'], now = Date.now()) {
  return projects.filter((p) => p.status === 'active').map((p) => {
    const photos = p.rooms.flatMap((r) => r.photos);
    const last = p.lastClientUpdateAt ? Date.parse(p.lastClientUpdateAt) : Date.parse(p.createdAt);
    const newer = photos.filter((ph) => Date.parse(ph.takenAt) > (p.lastClientUpdateAt ? last : 0)).length;
    return { p, newer, days: Math.floor((now - last) / DAY) };
  }).filter((x) => x.newer > 0 && x.days >= 3).sort((a, b) => b.days - a.days);
}

/** Home screen before the chat starts: one clear action, then today, money and recent photos. */
export function Dashboard({ claudeOn, onMic, onAsk }: { claudeOn: boolean; onMic: () => void; onAsk: (q: string) => void }) {
  const { profile, events, contracts, estimates, projects, team = [], followups = [] } = useApp();
  const { width } = useWindowDimensions();
  const today = useToday();
  const first = (profile?.contactName ?? '').trim().split(/\s+/)[0];
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening';
  const todays = upcoming(events, today, 0).slice(0, 3);
  const nextUp = todays.length ? [] : upcoming(events, today, 7).slice(0, 2);

  let due = 0, overdue = 0;
  for (const c of contracts) {
    const est = estimates.find((e) => e.id === c.estimateId);
    if (!est || !profile) continue;
    due += contractTotals(est, profile, c).due;
    overdue += Object.values(invoiceStates(c, today, est.salesTaxPct)).filter((s) => s.state === 'overdue').length;
  }
  const checkIns = dailyCheckIn({ projects, estimates, contracts, profile, events, team, followups, today });
  const waiting = estimates.filter((e) => e.status === 'sent').length;
  const activeJobs = projects.filter((p) => p.status === 'active').length;
  const photos: { ph: SitePhoto; pid: string; rid: string }[] = projects.flatMap((p) => p.rooms.flatMap((r) => r.photos.map((ph) => ({ ph, pid: p.id, rid: r.id }))))
    .sort((a, b) => b.ph.takenAt.localeCompare(a.ph.takenAt)).slice(0, 12);
  const cardW = Math.min(width, 760) - 32;
  const summary = [`${activeJobs} job${activeJobs === 1 ? '' : 's'} live`, todays.length ? `${todays.length} on today` : '', overdue ? `${overdue} invoice${overdue > 1 ? 's' : ''} overdue` : '']
    .filter(Boolean).join(' · ');

  // One list of what needs you today: Bidwell's check-ins first, then today's (or the next) appointments.
  const [allItems, setAllItems] = useState(false);
  const rows: Row[] = [
    ...checkIns.map((c) => ({ id: c.id, icon: c.icon as IconName, color: C.accent, title: c.text, action: c.action, route: c.route })),
    ...[...todays, ...nextUp].map((e) => ({
      id: e.id, icon: 'calendar' as IconName, color: KINDS[e.kind].color, title: e.title, route: `/event?id=${e.id}`,
      sub: `${e.date === today ? 'Today' : new Date(`${e.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' })} · ${timeLabel(e)}${e.address ? ` · ${e.address}` : ''}`,
    })),
  ];
  const shown = allItems ? rows : rows.slice(0, 4);

  return (
    <View style={{ gap: 22 }}>
      <Reveal style={{ gap: 2 }}>
        <Text style={{ color: C.muted, fontSize: 14, fontWeight: '500' }}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
        <Text style={{ color: C.ink, fontSize: 28, fontWeight: '700', letterSpacing: -0.5 }} numberOfLines={1}>{hello}{first ? `, ${first}` : ''}</Text>
        {summary ? <Text style={{ color: C.muted, fontSize: 14 }}>{summary}</Text> : null}
      </Reveal>

      {!claudeOn ? <ConnectClaude /> : null}

      {/* The one main action, and three other ways to start. */}
      <Reveal index={1} style={{ gap: 10 }}>
        <View style={{ overflow: 'hidden', borderRadius: 16 }}>
          <Button title="New estimate" icon="add" onPress={() => router.push('/new')} style={{ height: 56 }} />
          <Shine width={cardW} height={56} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip icon="mic" label="Talk" onPress={onMic} />
          <Chip icon="scan" label="Scan 3D" onPress={() => router.push('/scan')} />
          <Chip icon="camera" label="Photo" onPress={() => router.push('/quick')} />
        </View>
      </Reveal>

      <Reveal index={2} style={{ gap: 8 }}>
        <Section title={rows.length ? 'Today' : 'Today'} link="Schedule" onLink={() => router.push('/schedule')} />
        <View style={{ backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.line, overflow: 'hidden' }}>
          {shown.length ? shown.map((r, i) => (
            <Pressable key={r.id} accessibilityRole="button" onPress={() => router.push(r.route as never)}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12,
                borderTopWidth: i ? 1 : 0, borderColor: C.lineSoft, backgroundColor: pressed ? C.cardHi : 'transparent' })}>
              <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: `${r.color}1A`, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={r.icon} size={18} color={r.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.ink, fontSize: 15, lineHeight: 20 }} numberOfLines={2}>{r.title}</Text>
                {r.sub ? <Text style={{ color: C.muted, fontSize: 13 }} numberOfLines={1}>{r.sub}</Text> : null}
              </View>
              {r.action ? <Text style={{ color: C.accent, fontWeight: '600', fontSize: 14 }}>{r.action}</Text> : <Ionicons name="chevron-forward" size={16} color={C.muted} />}
            </Pressable>
          )) : (
            <Pressable accessibilityRole="button" onPress={() => router.push('/event')} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 }}>
              <Ionicons name="checkmark-circle" size={22} color={C.okInk} />
              <Text style={{ color: C.ink2, flex: 1 }}>All caught up. Tap to add a visit or crew day.</Text>
            </Pressable>
          )}
          {rows.length > 4 ? (
            <Pressable accessibilityRole="button" onPress={() => setAllItems((v) => !v)} style={{ padding: 12, alignItems: 'center', borderTopWidth: 1, borderColor: C.lineSoft }}>
              <Text style={{ color: C.accent, fontWeight: '600' }}>{allItems ? 'Show less' : `See all ${rows.length}`}</Text>
            </Pressable>
          ) : null}
        </View>
      </Reveal>

      {/* Money and work at a glance: one card, three numbers. */}
      <Reveal index={3}>
        <View style={{ flexDirection: 'row', backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.line }}>
          <Glance label="To collect" value={money(due)} sub={overdue ? `${overdue} overdue` : undefined} bad={!!overdue} onPress={() => router.push('/jobs')} />
          <Glance label="Quotes out" value={String(waiting)} onPress={() => router.push('/jobs')} divider />
          <Glance label="Active jobs" value={String(activeJobs)} onPress={() => router.push('/sites')} divider />
        </View>
      </Reveal>

      {photos.length ? (
        <Reveal index={4} style={{ gap: 8 }}>
          <Section title="Recent photos" link="Job sites" onLink={() => router.push('/sites')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {photos.map(({ ph, pid, rid }) => (
              <PressScale key={ph.id} accessibilityRole="button" accessibilityLabel="Open photo" onPress={() => router.push(`/site/${pid}/photo/${ph.id}?room=${rid}` as never)}>
                <View style={{ borderRadius: 14, overflow: 'hidden' }}><PhotoView photo={ph} width={104} /></View>
              </PressScale>
            ))}
          </ScrollView>
        </Reveal>
      ) : null}

      <Text style={{ color: C.muted, fontSize: 13, textAlign: 'center' }}>Ask Bidwell anything below: prices, materials, permits, client messages.</Text>
    </View>
  );
}

interface Row { id: string; icon: IconName; color: string; title: string; sub?: string; action?: string; route: string }

/** One number in the glance card. */
function Glance({ label, value, sub, bad, divider, onPress }: { label: string; value: string; sub?: string; bad?: boolean; divider?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label} ${value}`} onPress={onPress}
      style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 12, gap: 2, borderLeftWidth: divider ? 1 : 0, borderColor: C.lineSoft }}>
      <Text style={{ color: C.muted, fontSize: 12, fontWeight: '500' }}>{label}</Text>
      <Text style={{ color: bad ? C.danger : C.ink, fontSize: 20, fontWeight: '700' }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {sub ? <Text style={{ color: C.danger, fontSize: 11 }}>{sub}</Text> : null}
    </Pressable>
  );
}


type IconName = React.ComponentProps<typeof Ionicons>['name'];


/** Light pill under the main button: another way to start. */
function Chip({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <PressScale accessibilityRole="button" accessibilityLabel={label} onPress={onPress} scaleTo={0.95}
      style={{ flex: 1, height: 44, borderRadius: 14, backgroundColor: C.cardHi, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
      <Ionicons name={icon} size={18} color={C.accent} />
      <Text style={{ color: C.ink, fontSize: 14, fontWeight: '600' }}>{label}</Text>
    </PressScale>
  );
}



/** Shown until the AI is on: create a free Bidwell account (no key needed), or use your own Claude key. */
function ConnectClaude() {
  const { aiAllowed } = useApp();
  const cloud = useCloud();
  if (!aiAllowed) {
    return (
      <Reveal index={1}>
        <Card style={{ borderColor: C.accent, backgroundColor: C.accentTint }}>
          <Text style={{ color: C.ink, fontSize: 17, fontWeight: '700' }}>AI is turned off</Text>
          <Text style={{ color: C.ink2, fontSize: 14, lineHeight: 20 }}>You chose not to send job notes and photos to the AI. Turn it on in Settings to get estimates drafted for you.</Text>
          <Button kind="secondary" title="Open Settings" icon="settings-outline" onPress={() => router.push('/settings')} />
        </Card>
      </Reveal>
    );
  }
  return (
    <Reveal index={1}>
      <Card style={{ borderColor: C.accent, backgroundColor: C.accentTint }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Ionicons name="person-circle" size={26} color={C.accent} />
          <Text style={{ color: C.ink, fontSize: 17, fontWeight: '700', flex: 1 }}>Create your free Bidwell account</Text>
        </View>
        <Text style={{ color: C.ink2, fontSize: 14, lineHeight: 20 }}>
          One minute, just an email and password. It turns on the AI (no key needed), backs up your jobs and photos, and lets clients sign quotes from a link.
        </Text>
        {cloud.configured ? <Button title="Log in or create account" icon="person-add-outline" onPress={() => router.push('/login')} /> : null}
        <Button kind="secondary" title="I have my own Claude API key" icon="key-outline" onPress={() => router.push('/settings')} />
      </Card>
    </Reveal>
  );
}
