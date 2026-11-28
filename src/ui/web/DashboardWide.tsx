import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { money } from '@/engine/format';
import { dateLocale } from '@/engine/locale';
import { addDays, dayLabel, KINDS, startTime, upcoming } from '@/engine/schedule';
import { sheetRows } from '@/engine/sheet';
import { useApp } from '@/store/AppContext';

import { ConnectClaude, showJobs, useDashboard } from '../Dashboard';
import { Button } from '../kit';
import { PhotoView } from '../SitePhotoView';
import { NUM, Text } from '../text';
import { C } from '../theme';
import { clickable, hoverStyle } from '../wide';
import { Kpi, Panel, StagePill, TableHead, TableRow, type Col } from './parts';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const JOB_COLS: Col[] = [
  { key: 'job', label: 'Job', flex: 2.2 }, { key: 'client', label: 'Client', flex: 1.4 },
  { key: 'stage', label: 'Status', width: 110 }, { key: 'total', label: 'Total', width: 120, right: true },
];

/**
 * Home on a computer screen: the day's numbers across the top, what needs doing and the latest jobs on the left,
 * the week ahead on the right. The same facts as the phone's Home (useDashboard), laid out for a wide window.
 */
export function DashboardWide({ claudeOn }: { claudeOn: boolean }) {
  const { first, hello, due, overdue, jobs, waiting, activeJobs, photos, rows, visits, today } = useDashboard();
  const { projects, estimates, contracts, profile } = useApp();
  const books = sheetRows({ projects, estimates, contracts, profile, today }).total;
  const quotesOut = jobs.filter((j) => j.stage === 'sent').reduce((t, j) => t + (j.total ?? 0), 0);
  const week = upcoming(visits, today, 6);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i)).filter((d) => week.some((e) => e.date === d));
  const recent = [...jobs].sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 6);

  return (
    <View style={{ gap: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 16 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: C.ink, fontSize: 30, fontWeight: '700', letterSpacing: -0.6 }} numberOfLines={1}>{hello}{first ? `, ${first}` : ''}</Text>
          <Text style={{ color: C.muted, fontSize: 15 }}>{new Date().toLocaleDateString(dateLocale(), { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
        </View>
      </View>

      {!claudeOn ? <ConnectClaude /> : null}

      {jobs.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
          <Kpi icon="cash-outline" label="To collect" value={money(due)} tone={overdue ? 'bad' : undefined} onPress={() => showJobs('active')}
            sub={overdue ? (overdue === 1 ? '1 invoice overdue' : `${overdue} invoices overdue`) : 'On signed jobs'} />
          <Kpi icon="paper-plane-outline" label="Quotes out" value={String(waiting)} sub={waiting ? `${money(quotesOut)} waiting` : 'None waiting'} onPress={() => showJobs('quote')} />
          <Kpi icon="hammer-outline" label="Active jobs" value={String(activeJobs)} sub={activeJobs ? 'Signed or under way' : 'None under way'} onPress={() => showJobs('active')} />
          <Kpi icon="stats-chart-outline" label="Profit on your jobs" value={money(books.profit)} tone={books.profit < 0 ? 'bad' : undefined}
            sub={books.revenue > 0 ? `${books.marginPct}% margin` : 'No signed jobs yet'} onPress={() => router.push('/books')} />
        </View>
      ) : (
        <Panel>
          <View style={{ paddingTop: 20, gap: 10, alignItems: 'flex-start' }}>
            <Text style={{ color: C.ink, fontSize: 20, fontWeight: '700' }}>Price your first job</Text>
            <Text style={{ color: C.muted, fontSize: 15, lineHeight: 22 }}>Say or type what the job is. Studwise builds the estimate with your prices.</Text>
            <Button title="New estimate" icon="add" onPress={() => router.push('/new')} />
          </View>
        </Panel>
      )}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        <View style={{ flex: 3, minWidth: 420, gap: 20 }}>
          <Panel title="Needs you today" flush>
            {rows.length ? rows.slice(0, 8).map((r, i) => (
              <Pressable key={r.id} accessibilityRole="link" onPress={() => router.push(r.route as never)}
                style={hoverStyle((hovered) => ({ flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14, paddingHorizontal: 20, paddingVertical: 12, minHeight: 54,
                  borderTopWidth: 1, borderColor: i ? C.lineSoft : C.line, backgroundColor: hovered ? '#F7F9FC' : C.card, ...clickable }))}>
                <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: `${r.color}1A`, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={r.icon as IconName} size={18} color={r.color} />
                </View>
                <View style={{ flex: 1, gap: 1 }}>
                  <Text style={{ color: C.ink, fontSize: 15, lineHeight: 21 }} numberOfLines={3}>{r.title}</Text>
                  {r.sub ? <Text style={{ color: C.muted, fontSize: 13 }} numberOfLines={1}>{r.sub}</Text> : null}
                </View>
                {r.action ? (
                  <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 6 }}>
                    <Text style={{ color: C.accent, fontWeight: '600', fontSize: 13.5 }}>{r.action}</Text>
                  </View>
                ) : <Ionicons name="chevron-forward" size={16} color="#A3ACB9" />}
              </Pressable>
            )) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 18, borderTopWidth: 1, borderColor: C.line }}>
                <Ionicons name="checkmark-circle" size={20} color={C.okInk} />
                <Text style={{ color: C.ink2, fontSize: 15 }}>All caught up.</Text>
              </View>
            )}
          </Panel>

          {recent.length ? (
            <Panel title="Recent jobs" link="All jobs" onLink={() => showJobs('all')} flush>
              <TableHead cols={JOB_COLS} />
              {recent.map((j, i) => (
                <TableRow key={j.key} cols={JOB_COLS} first={!i} label={`${j.title}, ${j.label}`} onPress={() => router.push(`/job/${j.key}` as never)} cells={[
                  <Text key="t" raw style={{ color: C.ink, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>{j.title}</Text>,
                  <Text key="c" raw style={{ color: C.ink2, fontSize: 14 }} numberOfLines={1}>{j.client}</Text>,
                  <StagePill key="s" stage={j.stage} label={j.label} />,
                  <Text key="m" raw style={{ color: C.ink, fontSize: 15, fontWeight: '600', fontFamily: NUM }}>{j.total ? money(j.total) : ''}</Text>,
                ]} />
              ))}
            </Panel>
          ) : null}
        </View>

        <View style={{ flex: 2, minWidth: 300, gap: 20 }}>
          <Panel title="This week" link="Schedule" onLink={() => router.push('/schedule')}>
            {days.length ? days.map((d) => (
              <View key={d} style={{ gap: 6 }}>
                <Text style={{ color: d === today ? C.accent : C.muted, fontSize: 12.5, fontWeight: '600' }}>{dayLabel(d, today)}</Text>
                {week.filter((e) => e.date === d).map((e) => (
                  <Pressable key={e.id} accessibilityRole="link" accessibilityLabel={e.title} onPress={() => router.push(`/event?id=${e.id}`)}
                    style={hoverStyle((hovered) => ({ flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 10, backgroundColor: hovered ? C.cardHi : C.panel, ...clickable }))}>
                    <View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: KINDS[e.kind].color }} />
                    <View style={{ flex: 1 }}>
                      <Text raw style={{ color: C.ink, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{e.title}</Text>
                      {e.address ? <Text raw style={{ color: C.muted, fontSize: 12.5 }} numberOfLines={1}>{e.address}</Text> : null}
                    </View>
                    <Text style={{ color: C.ink2, fontSize: 13, fontFamily: NUM }}>{startTime(e.time) || 'All day'}</Text>
                  </Pressable>
                ))}
              </View>
            )) : <Text style={{ color: C.muted, fontSize: 14 }}>Nothing on the calendar for the next 7 days.</Text>}
            <Button kind="secondary" title="Add an appointment" icon="add" onPress={() => router.push(`/event?date=${today}`)} style={{ height: 42 }} />
          </Panel>

          {photos.length ? (
            <Panel title="Recent photos">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {photos.slice(0, 8).map(({ ph, pid, rid }) => (
                  <Pressable key={ph.id} accessibilityRole="link" accessibilityLabel="Open photo" onPress={() => router.push(`/site/${pid}/photo/${ph.id}?room=${rid}` as never)} style={{ borderRadius: 10, overflow: 'hidden' }}>
                    <PhotoView photo={ph} width={88} />
                  </Pressable>
                ))}
              </View>
            </Panel>
          ) : null}
        </View>
      </View>
    </View>
  );
}
