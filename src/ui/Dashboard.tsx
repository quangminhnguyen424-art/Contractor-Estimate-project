import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Linking, Platform, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';

import { contractTotals, invoiceStates } from '@/engine/contract';
import { money } from '@/engine/format';
import { KINDS, timeLabel, upcoming } from '@/engine/schedule';
import { localDay, projectProgress, type SitePhoto } from '@/engine/site';
import { useApp } from '@/store/AppContext';

import { Art } from './art';
import { Button, C, Card, Section, Tile, mono } from './kit';
import { PressScale, Reveal } from './motion';
import { PhotoView } from './SitePhotoView';
import { Text } from './text';

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

/** Home screen before the chat starts: today's work, money to collect, client updates due, and one-tap shortcuts. */
export function Dashboard({ claudeOn, onMic }: { claudeOn: boolean; onMic: () => void }) {
  const { profile, events, contracts, estimates, projects } = useApp();
  const { width } = useWindowDimensions();
  const today = localDay();
  const first = (profile?.contactName ?? '').trim().split(/\s+/)[0];
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const todays = upcoming(events, today, 0).slice(0, 3);
  const nextUp = todays.length ? [] : upcoming(events, today, 7).slice(0, 2);

  let due = 0, overdue = 0, balance = 0;
  for (const c of contracts) {
    const est = estimates.find((e) => e.id === c.estimateId);
    if (!est) continue;
    const t = contractTotals(est, c);
    due += t.due; balance += Math.max(0, t.balance);
    overdue += Object.values(invoiceStates(c, today)).filter((s) => s.state === 'overdue').length;
  }
  const waiting = estimates.filter((e) => e.status === 'sent').length;
  const updates = staleUpdates(projects).slice(0, 2);
  const photos: { ph: SitePhoto; pid: string; rid: string }[] = projects.flatMap((p) => p.rooms.flatMap((r) => r.photos.map((ph) => ({ ph, pid: p.id, rid: r.id }))))
    .sort((a, b) => b.ph.takenAt.localeCompare(a.ph.takenAt)).slice(0, 12);
  const heroW = Math.min(width, 760) - 64;

  return (
    <View style={{ gap: 14 }}>
      <Reveal style={{ gap: 2 }}>
        <Text style={{ color: C.muted, fontSize: 14 }}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
        <Text style={{ color: C.ink, fontSize: 28, fontWeight: '800', letterSpacing: -0.4 }}>{hello}{first ? `, ${first}` : ''}</Text>
      </Reveal>

      {!claudeOn ? <ConnectClaude /> : null}

      <Reveal index={1}>
        <Card style={{ backgroundColor: C.dark, padding: 0, overflow: 'hidden' }}>
          <View style={{ alignItems: 'center', paddingTop: 10 }}><Art name="hero" width={Math.min(heroW, 340)} /></View>
          <View style={{ padding: 16, gap: 10 }}>
            <Text style={{ color: C.ink, fontSize: 20, fontWeight: '800' }}>Describe a job. Get a price in minutes.</Text>
            <Text style={{ color: C.muted, fontSize: 14, lineHeight: 20 }}>Type or say what the client wants, add photos, and Claude fills in the estimate with your own prices.</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button title="New estimate" icon="add" style={{ flex: 1 }} onPress={() => router.push('/new')} />
              <PressScale accessibilityRole="button" accessibilityLabel="Talk to Claude" onPress={onMic}
                style={{ width: 54, height: 54, borderRadius: 16, backgroundColor: C.cardHi, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="mic" size={24} color={C.accent} />
              </PressScale>
            </View>
          </View>
        </Card>
      </Reveal>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <Tile index={2} icon="scan-outline" title="Scan 3D" sub="Rooms measured with LiDAR" onPress={() => router.push('/scan')} />
        <Tile index={3} icon="camera-outline" tone="sky" title="Job photo" sub="Into a job and room" onPress={() => router.push('/quick')} />
        <Tile index={4} icon="calendar-outline" tone="sky" title="Schedule" sub={todays.length ? `${todays.length} today` : 'Visits, crews, calls'} onPress={() => router.push('/schedule')} />
        <Tile index={5} icon="pricetags-outline" tone="slate" title="My pricing" sub="Rates, past jobs, types" onPress={() => router.push('/pricing')} />
      </View>

      {todays.length || nextUp.length ? (
        <Reveal index={6} style={{ gap: 8 }}>
          <Section title={todays.length ? 'Today' : 'Coming up'} link="Schedule" onLink={() => router.push('/schedule')} />
          {[...todays, ...nextUp].map((e) => (
            <Pressable key={e.id} accessibilityRole="button" onPress={() => router.push(`/event?id=${e.id}`)}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, opacity: pressed ? 0.75 : 1 })}>
              <View style={{ width: 6, alignSelf: 'stretch', borderRadius: 3, backgroundColor: KINDS[e.kind].color }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.ink, fontWeight: '700' }} numberOfLines={1}>{e.title}</Text>
                <Text style={{ color: C.muted, fontSize: 13 }}>{e.date === today ? '' : `${new Date(`${e.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' })} · `}{timeLabel(e)}{e.address ? ` · ${e.address}` : ''}</Text>
              </View>
            </Pressable>
          ))}
        </Reveal>
      ) : null}

      {due > 0 || waiting > 0 || balance > 0 ? (
        <Reveal index={7}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Money label="To collect" value={money(due)} sub={overdue ? `${overdue} overdue` : 'invoiced'} tone={overdue ? 'bad' : 'ok'} onPress={() => router.push('/jobs')} />
            <Money label="Quotes out" value={String(waiting)} sub="waiting on a yes" onPress={() => router.push('/jobs')} />
          </View>
        </Reveal>
      ) : null}

      {updates.map(({ p, newer, days }, i) => (
        <Reveal key={p.id} index={8 + i}>
          <PressScale accessibilityRole="button" onPress={() => router.push(`/site/${p.id}/share?mode=client`)} scaleTo={0.98}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, backgroundColor: C.skyTint, borderWidth: 1, borderColor: C.sky }}>
            <Ionicons name="images-outline" size={24} color={C.sky} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.ink, fontWeight: '700' }}>Send {p.clientName || p.title} a photo update</Text>
              <Text style={{ color: C.muted, fontSize: 13 }}>{newer} new photo{newer > 1 ? 's' : ''} · last update {p.lastClientUpdateAt ? `${days} days ago` : 'never'} · {projectProgress(p).pct}% done</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.sky} />
          </PressScale>
        </Reveal>
      ))}

      {photos.length ? (
        <Reveal index={10} style={{ gap: 8 }}>
          <Section title="Latest job photos" link="Job sites" onLink={() => router.push('/sites')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {photos.map(({ ph, pid, rid }) => (
              <PressScale key={ph.id} accessibilityRole="button" accessibilityLabel="Open photo" onPress={() => router.push(`/site/${pid}/photo/${ph.id}?room=${rid}` as never)}>
                <PhotoView photo={ph} width={120} />
              </PressScale>
            ))}
          </ScrollView>
        </Reveal>
      ) : null}
    </View>
  );
}

function Money({ label, value, sub, tone, onPress }: { label: string; value: string; sub: string; tone?: 'ok' | 'bad'; onPress: () => void }) {
  return (
    <PressScale accessibilityRole="button" accessibilityLabel={`${label} ${value}`} onPress={onPress} style={{ flex: 1, backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.line, padding: 14, gap: 2 }}>
      <Text style={{ color: C.muted, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: C.ink, fontSize: 22, fontWeight: '800', fontFamily: mono }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={{ color: tone === 'bad' ? C.danger : tone === 'ok' ? C.okInk : C.muted, fontSize: 12, fontWeight: '600' }}>{sub}</Text>
    </PressScale>
  );
}

/** Shown until Claude is connected: three steps to get a key, with buttons that open the right places. */
function ConnectClaude() {
  return (
    <Reveal index={1}>
      <Card style={{ borderColor: C.accent, backgroundColor: C.accentTint }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Ionicons name="sparkles" size={22} color={C.accent} />
          <Text style={{ color: C.ink, fontSize: 17, fontWeight: '800', flex: 1 }}>Connect Claude (about 5 minutes)</Text>
        </View>
        <Text style={{ color: C.ink2, fontSize: 14, lineHeight: 20 }}>
          The assistant, photo reading and auto-filled estimates need your own Claude key. Each question costs a few cents.
        </Text>
        {['Sign up at console.anthropic.com and add $10 credit (set a monthly limit).', 'Create an API key and copy it.', 'Paste it in Settings → Claude AI and tap Save and test.'].map((t, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: C.onAccent, fontWeight: '800', fontSize: 12 }}>{i + 1}</Text>
            </View>
            <Text style={{ color: C.ink, flex: 1, fontSize: 14, lineHeight: 20 }}>{t}</Text>
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button kind="secondary" title="Get a key" icon="open-outline" style={{ flex: 1 }}
            onPress={() => (Platform.OS === 'web' ? window.open('https://console.anthropic.com/settings/keys', '_blank') : Linking.openURL('https://console.anthropic.com/settings/keys'))} />
          <Button title="Paste key" icon="key-outline" style={{ flex: 1 }} onPress={() => router.push('/settings')} />
        </View>
      </Card>
    </Reveal>
  );
}
