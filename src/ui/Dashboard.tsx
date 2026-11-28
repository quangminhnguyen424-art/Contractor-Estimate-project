import { useLanguage } from '@/i18n';
import { inboxCounts } from '@/engine/inbox';
import { dateLocale } from '@/engine/locale';
import { dailyCheckIn } from '@/engine/pm';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { contractTotals, invoiceStates } from '@/engine/contract';
import { money } from '@/engine/format';
import { isLive, listJobs } from '@/engine/job';
import { KINDS, timeLabel, upcoming } from '@/engine/schedule';
import type { SitePhoto } from '@/engine/site';
import { useCloud } from '@/cloud/CloudProvider';
import { useApp } from '@/store/AppContext';

import { Button, C, Card, Section } from './kit';
import { PressScale, Reveal } from './motion';
import { PhotoView } from './SitePhotoView';
import { NUM, Text } from './text';
import { useToday } from './useToday';


/** Home screen before the chat starts: one clear action, then today, money and recent photos. */
/** Opens the Jobs tab filtered. `n` makes every tap a new request, so the same filter can be asked for twice. */
export const showJobs = (show: 'all' | 'quote' | 'active') => router.push(`/jobs?show=${show}&n=${Date.now()}`);

/** What Home shows, worked out once: the phone's Home and the computer's Home lay the same facts out differently. */
export function useDashboard() {
  useLanguage(); // dates on this screen are written here, so redraw when the language changes
  const { profile, events, contracts, estimates, projects, team = [], followups = [], inbox = [] } = useApp();
  const today = useToday();
  const first = (profile?.contactName ?? '').trim().split(/\s+/)[0];
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening';
  // Follow-up reminders show as their own check-in (with Send), so they are left out of the appointment rows.
  const visits = events.filter((e) => !e.title.startsWith('Follow up:'));
  const todays = upcoming(visits, today, 0).slice(0, 3);
  const nextUp = todays.length ? [] : upcoming(visits, today, 7).slice(0, 2);

  // "To collect": everything still unpaid on jobs the client has agreed to, invoiced yet or not.
  let due = 0, overdue = 0;
  for (const c of contracts) {
    const est = estimates.find((e) => e.id === c.estimateId);
    if (!est || !profile) continue;
    if (est.status === 'won' || c.accepted) due += Math.max(0, contractTotals(est, profile, c).balance);
    overdue += Object.values(invoiceStates(c, today, est.salesTaxPct)).filter((s) => s.state === 'overdue').length;
  }
  const checkIns = dailyCheckIn({ projects, estimates, contracts, profile, events, team, followups, today });
  const jobs = listJobs(estimates, projects, contracts, profile);
  const waiting = jobs.filter((j) => j.stage === 'sent').length;
  const activeJobs = jobs.filter(isLive).length;
  const photos: { ph: SitePhoto; pid: string; rid: string }[] = projects.flatMap((p) => p.rooms.flatMap((r) => r.photos.map((ph) => ({ ph, pid: p.id, rid: r.id }))))
    .sort((a, b) => b.ph.takenAt.localeCompare(a.ph.takenAt)).slice(0, 12);
  // One list of what needs you today: Studwise's check-ins first, then today's (or the next) appointments.
  const receiptsWaiting = inboxCounts(inbox).waiting;
  const rows: Row[] = [
    ...(receiptsWaiting ? [{ id: 'receipts', icon: 'receipt-outline' as IconName, color: C.accent, action: 'Sort', route: '/receipts',
      title: receiptsWaiting === 1 ? '1 receipt needs a job' : `${receiptsWaiting} receipts need a job` }] : []),
    ...checkIns.map((c) => ({ id: c.id, icon: c.icon as IconName, color: C.accent, title: c.text, action: c.action, route: c.route })),
    ...[...todays, ...nextUp].map((e) => ({
      id: e.id, icon: 'calendar' as IconName, color: KINDS[e.kind].color, title: e.title, route: `/event?id=${e.id}`,
      sub: `${e.date === today ? 'Today' : new Date(`${e.date}T12:00:00`).toLocaleDateString(dateLocale(), { weekday: 'short' })} · ${timeLabel(e)}${e.address ? ` · ${e.address}` : ''}`,
    })),
  ];
  return { profile, events, visits, today, first, hello, due, overdue, jobs, waiting, activeJobs, photos, rows };
}

export function Dashboard({ claudeOn, chatCount, onOpenChat }: { claudeOn: boolean; chatCount: number; onOpenChat: () => void }) {
  const { first, hello, due, overdue, jobs, waiting, activeJobs, photos, rows } = useDashboard();
  const { projects } = useApp();
  const [allItems, setAllItems] = useState(false);
  const shown = allItems ? rows : rows.slice(0, 4);

  return (
    <View style={{ gap: 20 }}>
      <View style={{ gap: 2, paddingTop: 4 }}>
        <Text style={{ color: C.ink, fontSize: 26, fontWeight: '700', letterSpacing: -0.4 }} numberOfLines={1}>{hello}{first ? `, ${first}` : ''}</Text>
        <Text style={{ color: C.muted, fontSize: 14 }}>{[new Date().toLocaleDateString(dateLocale(), { weekday: 'long', month: 'long', day: 'numeric' }), overdue ? `${overdue} invoice${overdue > 1 ? 's' : ''} overdue` : ''].filter(Boolean).join(' · ')}</Text>
      </View>

      {!claudeOn ? <ConnectClaude /> : null}

      {jobs.length ? (
        <View style={{ flexDirection: 'row', backgroundColor: C.panel, borderRadius: 16 }}>
          <Glance label="To collect" value={money(due)} sub={overdue ? `${overdue} overdue` : undefined} bad={!!overdue} onPress={() => showJobs('all')} />
          <Glance label="Quotes out" value={String(waiting)} onPress={() => showJobs('quote')} divider />
          <Glance label="Active jobs" value={String(activeJobs)} onPress={() => showJobs('active')} divider />
        </View>
      ) : null}
      {jobs.length && projects.length ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/books')} hitSlop={6}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -10, paddingHorizontal: 4, opacity: pressed ? 0.6 : 1 })}>
          <Ionicons name="stats-chart-outline" size={16} color={C.accent} />
          <Text style={{ flex: 1, color: C.accent, fontSize: 14, fontWeight: '600' }}>Money sheet: revenue, cost and profit by job</Text>
          <Ionicons name="chevron-forward" size={14} color={C.accent} />
        </Pressable>
      ) : null}
      {jobs.length ? null : (
        <View style={{ backgroundColor: C.panel, borderRadius: 16, padding: 18, gap: 12 }}>
          <Text style={{ color: C.ink, fontSize: 17, fontWeight: '600' }}>Price your first job</Text>
          <Text style={{ color: C.muted, fontSize: 14, lineHeight: 20 }}>Say or type what the job is. Studwise builds the estimate with your prices.</Text>
          <Button title="New estimate" icon="add" onPress={() => router.push('/new')} />
        </View>
      )}

      <View style={{ gap: 12 }}>
        <Section title="Needs you today" link="Schedule" onLink={() => router.push('/schedule')} />
        <View style={{ backgroundColor: C.panel, borderRadius: 16, overflow: 'hidden' }}>
          {shown.length ? shown.map((r, i) => (
            <Pressable key={r.id} accessibilityRole="button" onPress={() => router.push(r.route as never)}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13,
                borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderColor: C.line, backgroundColor: pressed ? C.cardHi : 'transparent' })}>
              <Ionicons name={r.icon} size={20} color={r.color} style={{ width: 22, textAlign: 'center' }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.ink, fontSize: 15, lineHeight: 20 }} numberOfLines={3}>{r.title}</Text>
                {r.sub ? <Text style={{ color: C.muted, fontSize: 13 }} numberOfLines={1}>{r.sub}</Text> : null}
              </View>
              {r.action ? <Text style={{ color: C.accent, fontWeight: '500', fontSize: 15 }}>{r.action}</Text> : <Ionicons name="chevron-forward" size={16} color="#A3ACB9" />}
            </Pressable>
          )) : (
            <Pressable accessibilityRole="button" onPress={() => router.push('/event')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 }}>
              <Ionicons name="checkmark" size={20} color={C.okInk} style={{ width: 22, textAlign: 'center' }} />
              <Text style={{ color: C.ink2, flex: 1, fontSize: 15 }}>All caught up. Tap to add a visit or crew day.</Text>
            </Pressable>
          )}
          {rows.length > 4 ? (
            <Pressable accessibilityRole="button" onPress={() => setAllItems((v) => !v)} style={{ padding: 12, alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderColor: C.line }}>
              <Text style={{ color: C.accent, fontWeight: '500' }}>{allItems ? 'Show less' : `See all ${rows.length}`}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {jobs.length ? (
        <View style={{ gap: 12 }}>
          <Section title="Recent jobs" link="All jobs" onLink={() => showJobs('all')} />
          <View style={{ backgroundColor: C.panel, borderRadius: 16, overflow: 'hidden' }}>
            {[...jobs].sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 3).map((j, i) => (
              <Pressable key={j.key} accessibilityRole="button" accessibilityLabel={`${j.title}, ${j.label}`} onPress={() => router.push(`/job/${j.key}` as never)}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13,
                  borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderColor: C.line, backgroundColor: pressed ? C.cardHi : 'transparent' })}>
                <View style={{ flex: 1, gap: 1 }}>
                  <Text raw style={{ color: C.ink, fontSize: 16 }} numberOfLines={1}>{j.title}</Text>
                  <Text style={{ color: C.muted, fontSize: 13 }} numberOfLines={1}>{j.label}</Text>
                </View>
                {j.total ? <Text style={{ color: C.ink, fontSize: 16, fontWeight: '600', fontFamily: NUM }}>{money(j.total)}</Text> : null}
                <Ionicons name="chevron-forward" size={16} color="#A3ACB9" />
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {photos.length ? (
        <View style={{ gap: 12 }}>
          <Section title="Recent photos" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {photos.map(({ ph, pid, rid }) => (
              <PressScale key={ph.id} accessibilityRole="button" accessibilityLabel="Open photo" onPress={() => router.push(`/site/${pid}/photo/${ph.id}?room=${rid}` as never)}>
                <View style={{ borderRadius: 14, overflow: 'hidden' }}><PhotoView photo={ph} width={104} /></View>
              </PressScale>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {chatCount ? (
        <Pressable accessibilityRole="button" onPress={onOpenChat}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.panel, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14 }}>
          <Ionicons name="chatbubble-ellipses-outline" size={20} color={C.ink2} style={{ width: 22, textAlign: 'center' }} />
          <Text style={{ color: C.ink, flex: 1, fontSize: 16 }}>Continue your chat with Studwise</Text>
          <Ionicons name="chevron-forward" size={16} color="#A3ACB9" />
        </Pressable>
      ) : null}
    </View>
  );
}

export interface Row { id: string; icon: IconName; color: string; title: string; sub?: string; action?: string; route: string }

/** One number in the glance card. */
function Glance({ label, value, sub, bad, divider, onPress }: { label: string; value: string; sub?: string; bad?: boolean; divider?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label} ${value}`} onPress={onPress}
      style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 14, gap: 3, borderLeftWidth: divider ? StyleSheet.hairlineWidth : 0, borderColor: C.line }}>
      <Text style={{ color: C.muted, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: bad ? C.danger : C.ink, fontSize: 21, fontWeight: '700', fontFamily: NUM, letterSpacing: -0.3 }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {sub ? <Text style={{ color: C.danger, fontSize: 11 }}>{sub}</Text> : null}
    </Pressable>
  );
}


type IconName = React.ComponentProps<typeof Ionicons>['name'];


/** Shown until the AI is on: create a free Studwise account (no key needed), or use your own Claude key. */
export function ConnectClaude() {
  const { aiAllowed } = useApp();
  const cloud = useCloud();
  if (!aiAllowed) {
    return (
      <Reveal index={1}>
        <Card style={{ borderColor: C.accent, backgroundColor: C.accentTint }}>
          <Text style={{ color: C.ink, fontSize: 17, fontWeight: '700' }}>AI is turned off</Text>
          <Text style={{ color: C.ink2, fontSize: 14, lineHeight: 20 }}>You chose not to send job notes and photos to the AI. Turn it on to get estimates drafted for you.</Text>
          <Button kind="secondary" title="Turn on Studwise AI" icon="sparkles" onPress={() => router.push('/settings?s=ai')} />
        </Card>
      </Reveal>
    );
  }
  return (
    <Reveal index={1}>
      <Card style={{ borderColor: C.accent, backgroundColor: C.accentTint }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Ionicons name="person-circle" size={26} color={C.accent} />
          <Text style={{ color: C.ink, fontSize: 17, fontWeight: '700', flex: 1 }}>Create your free Studwise account</Text>
        </View>
        <Text style={{ color: C.ink2, fontSize: 14, lineHeight: 20 }}>
          One minute, just an email and password. It turns on the AI (no key needed), backs up your jobs and photos, and lets clients sign quotes from a link.
        </Text>
        {cloud.configured ? <Button title="Log in or create account" icon="person-add-outline" onPress={() => router.push('/login')} /> : null}
        <Button kind="secondary" title="I have my own Claude API key" icon="key-outline" onPress={() => router.push('/settings?s=ai')} />
      </Card>
    </Reveal>
  );
}
