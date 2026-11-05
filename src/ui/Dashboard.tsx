import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Linking, Platform, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';

import { contractTotals, invoiceStates } from '@/engine/contract';
import { money } from '@/engine/format';
import { KINDS, timeLabel, upcoming } from '@/engine/schedule';
import { projectProgress, type SitePhoto } from '@/engine/site';
import { useApp } from '@/store/AppContext';

import { Art } from './art';
import { Button, C, Card, Section, mono } from './kit';
import { Blink, HudPanel, Radar, Readout, TypeLines } from './hud';
import { PressScale, Reveal, Shine, useCountUp } from './motion';
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

/** Home screen before the chat starts: one clear action, shortcuts, today, money, and what needs attention. */
export function Dashboard({ claudeOn, onMic, onAsk }: { claudeOn: boolean; onMic: () => void; onAsk: (q: string) => void }) {
  const { profile, events, contracts, estimates, projects } = useApp();
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
  const waiting = estimates.filter((e) => e.status === 'sent').length;
  const activeJobs = projects.filter((p) => p.status === 'active').length;
  const updates = staleUpdates(projects).slice(0, 2);
  const photos: { ph: SitePhoto; pid: string; rid: string }[] = projects.flatMap((p) => p.rooms.flatMap((r) => r.photos.map((ph) => ({ ph, pid: p.id, rid: r.id }))))
    .sort((a, b) => b.ph.takenAt.localeCompare(a.ph.takenAt)).slice(0, 12);
  const cardW = Math.min(width, 760) - 32;
  const summary = [`${activeJobs} job${activeJobs === 1 ? '' : 's'} live`, todays.length ? `${todays.length} on today` : '', overdue ? `${overdue} invoice${overdue > 1 ? 's' : ''} overdue` : '']
    .filter(Boolean).join(' · ');

  return (
    <View style={{ gap: 16 }}>
      <Reveal style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Readout>Bidwell // field mode</Readout>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Blink color={claudeOn ? C.okInk : C.warnInk} on={claudeOn} />
            <Readout color={claudeOn ? C.okInk : C.warnInk}>{claudeOn ? 'Bidwell link ok' : 'Bidwell offline'}</Readout>
          </View>
        </View>
        <Text style={{ color: C.ink, fontSize: 30, fontWeight: '700', letterSpacing: -0.5 }} numberOfLines={1}>{hello}{first ? `, ${first}` : ''}.</Text>
        <Text style={{ color: C.muted, fontSize: 14 }}>{summary}</Text>
      </Reveal>

      {!claudeOn ? <ConnectClaude /> : null}

      {/* The one main action. */}
      <Reveal index={1}>
        <HudPanel style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Radar size={Math.min(96, cardW * 0.26)} />
          <View style={{ flex: 1, gap: 8, minWidth: 0 }}>
            <Readout color={C.accentDark}>New estimate</Readout>
            <TypeLines lines={['"hall bath, tub to tile shower…"', '"300 sf LVP in 2 bedrooms"', '"basement ADU, kitchen + 2 baths"', '"thay ống nước nóng 50 gal"']} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1, overflow: 'hidden', borderRadius: 4 }}>
                <Button title="Start" icon="add" onPress={() => router.push('/new')} style={{ height: 46 }} />
                <Shine width={cardW - 200} height={46} />
              </View>
              <PressScale accessibilityRole="button" accessibilityLabel="Talk to Bidwell" onPress={onMic}
                style={{ width: 46, height: 46, borderRadius: 4, borderWidth: 1, borderColor: C.accent, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="mic" size={22} color={C.accent} />
              </PressScale>
            </View>
          </View>
        </HudPanel>
      </Reveal>

      {/* Shortcuts: one tidy row. */}
      <Reveal index={2} style={{ flexDirection: 'row', gap: 8 }}>
        <Shortcut icon="scan" label="Scan 3D" colors={['#FF7A1A', '#FF7A1A']} onPress={() => router.push('/scan')} />
        <Shortcut icon="camera" label="Job photo" colors={['#38BDF8', '#2563EB']} onPress={() => router.push('/quick')} />
        <Shortcut icon="calendar" label="Schedule" colors={['#A78BFA', '#7C3AED']} badge={todays.length || undefined} onPress={() => router.push('/schedule')} />
        <Shortcut icon="pricetags" label="Pricing" colors={['#34D399', '#059669']} onPress={() => router.push('/pricing')} />
        <Shortcut icon="git-network" label="Apps" colors={['#F472B6', '#F472B6']} onPress={() => router.push('/connections')} />
      </Reveal>

      {/* Numbers at a glance. */}
      <Reveal index={3} style={{ flexDirection: 'row', gap: 10 }}>
        <Money label="To collect" value={due} sub={overdue ? `${overdue} overdue` : due ? 'invoiced' : 'all paid'} tone={overdue ? 'bad' : 'ok'} onPress={() => router.push('/jobs')} />
        <Count label="Quotes out" value={waiting} onPress={() => router.push('/jobs')} />
        <Count label="Active jobs" value={activeJobs} onPress={() => router.push('/sites')} />
      </Reveal>

      <Reveal index={4} style={{ gap: 8 }}>
        <Section title={todays.length ? 'Today' : 'Coming up'} link="Schedule" onLink={() => router.push('/schedule')} />
        {todays.length || nextUp.length ? [...todays, ...nextUp].map((e) => (
          <Pressable key={e.id} accessibilityRole="button" onPress={() => router.push(`/event?id=${e.id}`)}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 6, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, opacity: pressed ? 0.75 : 1 })}>
            <View style={{ width: 5, alignSelf: 'stretch', borderRadius: 3, backgroundColor: KINDS[e.kind].color }} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.ink, fontWeight: '700' }} numberOfLines={1}>{e.title}</Text>
              <Text style={{ color: C.muted, fontSize: 13 }} numberOfLines={1}>{e.date === today ? '' : `${new Date(`${e.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' })} · `}{timeLabel(e)}{e.address ? ` · ${e.address}` : ''}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={C.muted} />
          </Pressable>
        )) : (
          <Pressable accessibilityRole="button" onPress={() => router.push('/event')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 6, borderWidth: 1, borderColor: C.line, borderStyle: 'dashed' }}>
            <Ionicons name="add-circle-outline" size={20} color={C.accent} />
            <Text style={{ color: C.muted }}>Nothing scheduled. Add a visit or crew day.</Text>
          </Pressable>
        )}
      </Reveal>

      {updates.map(({ p, newer, days }, i) => (
        <Reveal key={p.id} index={5 + i}>
          <PressScale accessibilityRole="button" onPress={() => router.push(`/site/${p.id}/share?mode=client`)} scaleTo={0.98}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 6, backgroundColor: C.skyTint, borderWidth: 1, borderColor: 'rgba(56,189,248,0.5)' }}>
            <Art name="photos" width={72} still />
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.ink, fontWeight: '700' }} numberOfLines={1}>Photo update for {p.clientName || p.title}</Text>
              <Text style={{ color: C.muted, fontSize: 12 }}>{newer} new · last sent {p.lastClientUpdateAt ? `${days}d ago` : 'never'} · {projectProgress(p).pct}% done</Text>
            </View>
            <Ionicons name="send" size={18} color={C.sky} />
          </PressScale>
        </Reveal>
      ))}

      {photos.length ? (
        <Reveal index={7} style={{ gap: 8 }}>
          <Section title="Latest job photos" link="Job sites" onLink={() => router.push('/sites')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {photos.map(({ ph, pid, rid }) => (
              <PressScale key={ph.id} accessibilityRole="button" accessibilityLabel="Open photo" onPress={() => router.push(`/site/${pid}/photo/${ph.id}?room=${rid}` as never)}>
                <View style={{ borderRadius: 6, overflow: 'hidden' }}><PhotoView photo={ph} width={112} /></View>
              </PressScale>
            ))}
          </ScrollView>
        </Reveal>
      ) : null}

      <Reveal index={8} style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Art name="ai" width={64} still />
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.ink, fontSize: 17, fontWeight: '800' }}>Ask Bidwell anything</Text>
            <Text style={{ color: C.muted, fontSize: 12 }}>Prices, materials, permits, messages to clients. Type or talk below.</Text>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {SUGGESTIONS.map((q) => (
            <PressScale key={q} accessibilityRole="button" accessibilityLabel={q} onPress={() => onAsk(q)}
              style={{ width: 200, padding: 12, borderRadius: 6, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, gap: 6 }}>
              <Ionicons name="sparkles" size={16} color={C.accent} />
              <Text style={{ color: C.ink2, fontSize: 13, lineHeight: 18 }} numberOfLines={3}>{q}</Text>
            </PressScale>
          ))}
        </ScrollView>
      </Reveal>
    </View>
  );
}

const SUGGESTIONS = [
  'Price a 45 SF hall bathroom remodel, tiled shower, mid-grade',
  'Do I need a permit to replace a water heater in Seattle?',
  'How do my bathroom prices compare to my past jobs?',
  'Write a friendly follow-up text for a quote I sent last week',
  'Lên danh sách vật tư cho 300 SF sàn LVP',
];

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Round, colorful shortcut button with a label. */
function Shortcut({ icon, label, colors, onPress, badge }: { icon: IconName; label: string; colors: [string, string]; onPress: () => void; badge?: number }) {
  return (
    <PressScale accessibilityRole="button" accessibilityLabel={label} onPress={onPress} scaleTo={0.92} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
      <View style={{ width: '100%', height: 64, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ position: 'absolute', left: 0, top: 0, width: 10, height: 2, backgroundColor: colors[0] }} />
        <Ionicons name={icon} size={26} color={colors[0]} />
        {badge ? (
          <View style={{ position: 'absolute', right: 4, top: 4, minWidth: 18, height: 18, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
            <Text style={{ color: C.onAccent, fontSize: 11, fontWeight: '700', fontFamily: mono }}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={{ color: C.ink2, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{label}</Text>
    </PressScale>
  );
}

function Count({ label, value, onPress }: { label: string; value: number; onPress: () => void }) {
  const n = useCountUp(value, 700);
  return (
    <PressScale accessibilityRole="button" accessibilityLabel={`${label} ${value}`} onPress={onPress} style={{ flex: 1, backgroundColor: C.card, borderRadius: 6, borderWidth: 1, borderColor: C.line, padding: 12, gap: 2 }}>
      <Readout>{label}</Readout>
      <Text style={{ color: C.ink, fontSize: 22, fontWeight: '700', fontFamily: mono }}>{String(Math.round(n)).padStart(2, '0')}</Text>
    </PressScale>
  );
}

function Money({ label, value, sub, tone, onPress }: { label: string; value: number; sub: string; tone?: 'ok' | 'bad'; onPress: () => void }) {
  const n = useCountUp(value);
  return (
    <PressScale accessibilityRole="button" accessibilityLabel={`${label} ${money(value)}`} onPress={onPress} style={{ flex: 1.4, backgroundColor: C.card, borderRadius: 6, borderWidth: 1, borderColor: C.line, padding: 12, gap: 2 }}>
      <Readout>{label}</Readout>
      <Text style={{ color: C.accent, fontSize: 22, fontWeight: '700', fontFamily: mono }} numberOfLines={1} adjustsFontSizeToFit>{money(n)}</Text>
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
          <Text style={{ color: C.ink, fontSize: 17, fontWeight: '800', flex: 1 }}>Turn on Bidwell AI (about 5 minutes)</Text>
        </View>
        <Text style={{ color: C.ink2, fontSize: 14, lineHeight: 20 }}>
          Bidwell AI runs on Anthropic’s Claude. The assistant, photo reading and auto-filled estimates need your own Claude API key. Each question costs a few cents.
        </Text>
        {['Sign up at console.anthropic.com and add $10 credit (set a monthly limit).', 'Create an API key and copy it.', 'Paste it in Settings → Bidwell AI and tap Save and test.'].map((t, i) => (
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
