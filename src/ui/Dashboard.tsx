import { dailyCheckIn } from '@/engine/pm';
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
import { Blink, TypeLines } from './hud';
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
  const updates = staleUpdates(projects).slice(0, 2);
  const photos: { ph: SitePhoto; pid: string; rid: string }[] = projects.flatMap((p) => p.rooms.flatMap((r) => r.photos.map((ph) => ({ ph, pid: p.id, rid: r.id }))))
    .sort((a, b) => b.ph.takenAt.localeCompare(a.ph.takenAt)).slice(0, 12);
  const cardW = Math.min(width, 760) - 32;
  const summary = [`${activeJobs} job${activeJobs === 1 ? '' : 's'} live`, todays.length ? `${todays.length} on today` : '', overdue ? `${overdue} invoice${overdue > 1 ? 's' : ''} overdue` : '']
    .filter(Boolean).join(' · ');

  return (
    <View style={{ gap: 16 }}>
      <Reveal style={{ gap: 4 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ color: C.muted, fontSize: 14, fontWeight: '500' }}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: claudeOn ? C.okBg : C.warnBg, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Blink color={claudeOn ? C.okInk : C.warnInk} on={claudeOn} />
            <Text style={{ color: claudeOn ? C.okInk : C.warnInk, fontSize: 12, fontWeight: '600' }}>{claudeOn ? 'AI ready' : 'AI off'}</Text>
          </View>
        </View>
        <Text style={{ color: C.ink, fontSize: 30, fontWeight: '700', letterSpacing: -0.6 }} numberOfLines={1}>{hello}{first ? `, ${first}` : ''}</Text>
        <Text style={{ color: C.muted, fontSize: 14 }}>{summary}</Text>
      </Reveal>

      {!claudeOn ? <ConnectClaude /> : null}

      {/* The one main action: a floor plan drawing itself, then three ways to start. */}
      <Reveal index={1}>
        <View style={{ backgroundColor: C.card, borderRadius: 24, padding: 16, gap: 14, shadowColor: '#2457F5', shadowOpacity: 0.12, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 4 }}>
          <View style={{ backgroundColor: C.infoBg, borderRadius: 18, alignItems: 'center', overflow: 'hidden', paddingVertical: 6 }}>
            <Art name="hero" width={Math.min(cardW - 32, 340)} beam />
          </View>
          <View style={{ gap: 4 }}>
            <Text style={{ color: C.ink, fontSize: 20, fontWeight: '700' }}>Price a job in minutes</Text>
            <TypeLines lines={['"hall bath, tub to tile shower…"', '"300 sf LVP in 2 bedrooms"', '"basement ADU, kitchen + 2 baths"', '"thay ống nước nóng 50 gal"']} />
          </View>
          <View style={{ overflow: 'hidden', borderRadius: 16 }}>
            <Button title="New estimate" icon="add" onPress={() => router.push('/new')} style={{ height: 54 }} />
            <Shine width={cardW - 32} height={54} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip icon="mic" label="Talk" onPress={onMic} />
            <Chip icon="scan" label="Scan 3D" onPress={() => router.push('/scan')} />
            <Chip icon="camera" label="Photo" onPress={() => router.push('/quick')} />
          </View>
        </View>
      </Reveal>

      {/* Shortcuts: one tidy row. */}
      <Reveal index={2} style={{ flexDirection: 'row', gap: 8 }}>
        <Shortcut icon="briefcase" label="Jobs" colors={['#2457F5', '#2457F5']} onPress={() => router.push('/jobs')} />
        <Shortcut icon="images" label="Sites" colors={['#0369A1', '#0369A1']} onPress={() => router.push('/sites')} />
        <Shortcut icon="calendar" label="Schedule" colors={['#7C3AED', '#7C3AED']} badge={todays.length || undefined} onPress={() => router.push('/schedule')} />
        <Shortcut icon="pricetags" label="Pricing" colors={['#08734F', '#08734F']} onPress={() => router.push('/pricing')} />
        <Shortcut icon="people" label="Crew" colors={['#FF6B1A', '#FF6B1A']} onPress={() => router.push('/team')} />
      </Reveal>

      {/* Bidwell as project manager: what needs you today, across every job. */}
      {checkIns.length ? (
        <Reveal index={2} style={{ gap: 8 }}>
          <Section title={`Bidwell check-in · ${checkIns.length}`} />
          {checkIns.map((c) => (
            <Pressable key={c.id} accessibilityRole="button" accessibilityLabel={`${c.text} ${c.action}`} onPress={() => router.push(c.route as never)}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 12, opacity: pressed ? 0.75 : 1 })}>
              <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: C.accentTint, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={c.icon as never} size={19} color={C.accent} /></View>
              <Text style={{ flex: 1, color: C.ink, fontSize: 15, lineHeight: 21 }}>{c.text}</Text>
              <Text style={{ color: C.accent, fontWeight: '700' }}>{c.action}</Text>
            </Pressable>
          ))}
        </Reveal>
      ) : null}

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
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, opacity: pressed ? 0.75 : 1 })}>
            <View style={{ width: 5, alignSelf: 'stretch', borderRadius: 3, backgroundColor: KINDS[e.kind].color }} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.ink, fontWeight: '700' }} numberOfLines={1}>{e.title}</Text>
              <Text style={{ color: C.muted, fontSize: 13 }} numberOfLines={1}>{e.date === today ? '' : `${new Date(`${e.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' })} · `}{timeLabel(e)}{e.address ? ` · ${e.address}` : ''}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={C.muted} />
          </Pressable>
        )) : (
          <Pressable accessibilityRole="button" onPress={() => router.push('/event')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: C.line, borderStyle: 'dashed' }}>
            <Ionicons name="add-circle-outline" size={20} color={C.accent} />
            <Text style={{ color: C.muted }}>Nothing scheduled. Add a visit or crew day.</Text>
          </Pressable>
        )}
      </Reveal>

      {updates.map(({ p, newer, days }, i) => (
        <Reveal key={p.id} index={5 + i}>
          <PressScale accessibilityRole="button" onPress={() => router.push(`/site/${p.id}/share?mode=client`)} scaleTo={0.98}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, backgroundColor: C.skyTint, borderWidth: 1, borderColor: 'rgba(3,105,161,0.25)' }}>
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
                <View style={{ borderRadius: 14, overflow: 'hidden' }}><PhotoView photo={ph} width={112} /></View>
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
              style={{ width: 200, padding: 12, borderRadius: 14, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, gap: 6 }}>
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

/** Rounded shortcut tile: tinted icon on white. */
function Shortcut({ icon, label, colors, onPress, badge }: { icon: IconName; label: string; colors: [string, string]; onPress: () => void; badge?: number }) {
  return (
    <PressScale accessibilityRole="button" accessibilityLabel={label} onPress={onPress} scaleTo={0.92} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
      <View style={{ width: '100%', height: 64, borderRadius: 18, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: `${colors[0]}1A`, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={21} color={colors[0]} />
        </View>
        {badge ? (
          <View style={{ position: 'absolute', right: 6, top: 6, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: C.orange, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
            <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={{ color: C.ink2, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{label}</Text>
    </PressScale>
  );
}

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

function Count({ label, value, onPress }: { label: string; value: number; onPress: () => void }) {
  const n = useCountUp(value, 700);
  return (
    <PressScale accessibilityRole="button" accessibilityLabel={`${label} ${value}`} onPress={onPress} style={{ flex: 1, backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.line, padding: 14, gap: 2 }}>
      <Text style={{ color: C.muted, fontSize: 12, fontWeight: '500' }}>{label}</Text>
      <Text style={{ color: C.ink, fontSize: 22, fontWeight: '700', fontFamily: mono }}>{Math.round(n)}</Text>
    </PressScale>
  );
}

function Money({ label, value, sub, tone, onPress }: { label: string; value: number; sub: string; tone?: 'ok' | 'bad'; onPress: () => void }) {
  const n = useCountUp(value);
  return (
    <PressScale accessibilityRole="button" accessibilityLabel={`${label} ${money(value)}`} onPress={onPress} style={{ flex: 1.4, backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.line, padding: 14, gap: 2 }}>
      <Text style={{ color: C.muted, fontSize: 12, fontWeight: '500' }}>{label}</Text>
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
