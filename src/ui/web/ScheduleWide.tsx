import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { contractTotals, invoiceStates } from '@/engine/contract';
import { money } from '@/engine/format';
import { dateLocale } from '@/engine/locale';
import { dayLabel, eventsOn, KINDS, monthWeeks, shiftMonth, startTime, timeLabel, upcoming, type CalEvent } from '@/engine/schedule';
import { useLanguage } from '@/i18n';
import { useApp } from '@/store/AppContext';

import { Button, PAGE_W } from '../kit';
import { Text } from '../text';
import { C } from '../theme';
import { useToday } from '../useToday';
import { clickable, D, hoverStyle } from '../wide';
import { Panel } from './parts';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const MAX_IN_DAY = 3;

/**
 * The calendar on a computer screen: a whole month at a glance, with the picked day and what is coming up beside it.
 * Click a day to see it, a line in a day to open that appointment.
 */
export function ScheduleWide() {
  useLanguage(); // dates are written here, so redraw when the language changes
  const { events, estimates, contracts, projects, profile } = useApp();
  const today = useToday();
  const [picked, setDay] = useState<string | null>(null);
  const day = picked ?? today;
  const [month, setMonth] = useState<string | null>(null);
  const ym = month ?? day.slice(0, 7);
  const weeks = monthWeeks(ym);
  const onDay = eventsOn(events, day);
  const next = upcoming(events, today, 90).filter((e) => e.date !== day).slice(0, 6);
  const jobName = (e: CalEvent) => projects.find((p) => p.id === e.projectId)?.title ?? estimates.find((x) => x.id === e.estimateId)?.title ?? '';
  const dueInvoices = contracts.flatMap((c) => {
    const est = estimates.find((e) => e.id === c.estimateId);
    if (!est || !profile) return [];
    const st = invoiceStates(c, today, est.salesTaxPct);
    return c.invoices.filter((v) => v.dueDate === day && st[v.id]?.state !== 'paid').map((v) => ({ v, est, c }));
  });
  const pick = (d: string) => { setDay(d); setMonth(d.slice(0, 7)); };
  const weekdays = weeks[0].map((d) => new Date(`${d}T12:00:00`).toLocaleDateString(dateLocale(), { weekday: 'short' }));
  const arrow = (dir: -1 | 1) => (
    <Pressable accessibilityRole="button" accessibilityLabel={dir < 0 ? 'Last month' : 'Next month'} onPress={() => setMonth(shiftMonth(ym, dir))}
      style={hoverStyle((hovered) => ({ width: 36, height: 36, borderRadius: 10, borderWidth: 1, borderColor: C.line, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: hovered ? C.cardHi : C.card }))}>
      <Ionicons name={dir < 0 ? 'chevron-back' : 'chevron-forward'} size={18} color={C.ink} />
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: D.canvas, padding: 28 }}>
      <View style={{ flex: 1, flexDirection: 'row', gap: 20, width: '100%', maxWidth: PAGE_W.page, alignSelf: 'center' }}>
        <Panel flush fill style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 14 }}>
            <Text raw style={{ flex: 1, color: C.ink, fontSize: 20, fontWeight: '700', letterSpacing: -0.2 }}>{new Date(`${ym}-01T12:00:00`).toLocaleDateString(dateLocale(), { month: 'long', year: 'numeric' })}</Text>
            <Pressable accessibilityRole="button" onPress={() => { setDay(null); setMonth(null); }}
              style={hoverStyle((hovered) => ({ height: 36, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: C.line, justifyContent: 'center' as const, backgroundColor: hovered ? C.cardHi : C.card }))}>
              <Text style={{ color: C.ink, fontSize: 14, fontWeight: '600' }}>Today</Text>
            </Pressable>
            {arrow(-1)}{arrow(1)}
          </View>
          <View style={{ flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.line, backgroundColor: C.panel }}>
            {weekdays.map((w) => <Text key={w} raw style={{ flex: 1, paddingHorizontal: 10, paddingVertical: 8, color: C.muted, fontSize: 12.5, fontWeight: '600' }}>{w}</Text>)}
          </View>
          <View style={{ flex: 1 }}>
            {weeks.map((week, wi) => (
              <View key={week[0]} style={{ flex: 1, flexDirection: 'row', minHeight: 96, borderTopWidth: wi ? 1 : 0, borderColor: C.lineSoft }}>
                {week.map((d, di) => {
                  const inMonth = d.slice(0, 7) === ym;
                  const list = eventsOn(events, d);
                  const on = d === day;
                  return (
                    <Pressable key={d} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={dayLabel(d, today)} onPress={() => pick(d)}
                      style={hoverStyle((hovered) => ({ flex: 1, minWidth: 0, padding: 6, gap: 3, borderLeftWidth: di ? 1 : 0, borderColor: C.lineSoft,
                        backgroundColor: on ? C.infoBg : hovered ? '#F7F9FC' : inMonth ? C.card : '#FAFBFC', ...clickable }))}>
                      <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: d === today ? C.accent : 'transparent' }}>
                        <Text raw style={{ fontSize: 13.5, fontWeight: d === today || on ? '700' : '500', color: d === today ? '#FFFFFF' : inMonth ? C.ink : '#A3ACB9' }}>{String(Number(d.slice(8)))}</Text>
                      </View>
                      {list.slice(0, MAX_IN_DAY).map((e) => (
                        <Pressable key={e.id} accessibilityRole="link" accessibilityLabel={e.title} onPress={() => router.push(`/event?id=${e.id}`)}
                          style={hoverStyle((hovered) => ({ flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2, backgroundColor: hovered ? `${KINDS[e.kind].color}40` : `${KINDS[e.kind].color}24`, opacity: e.done ? 0.5 : 1 }))}>
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: KINDS[e.kind].color }} />
                          <Text raw style={{ flex: 1, color: C.ink, fontSize: 12, fontWeight: '500' }} numberOfLines={1}>{[startTime(e.time), e.title].filter(Boolean).join(' ')}</Text>
                        </Pressable>
                      ))}
                      {list.length > MAX_IN_DAY ? <Text style={{ color: C.muted, fontSize: 11.5, paddingHorizontal: 5 }}>{`${list.length - MAX_IN_DAY} more`}</Text> : null}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        </Panel>

        <View style={{ width: 340, gap: 20 }}>
          <Panel title={dayLabel(day, today)}>
            {onDay.length === 0 && dueInvoices.length === 0 ? <Text style={{ color: C.muted, fontSize: 14 }}>Nothing scheduled.</Text> : null}
            {onDay.map((e) => <EventLine key={e.id} e={e} sub={[timeLabel(e), jobName(e)].filter(Boolean).join(' · ')} />)}
            {dueInvoices.map(({ v, est, c }) => (
              <Pressable key={v.id} accessibilityRole="link" onPress={() => router.push(`/estimate/${est.id}/contract`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Dot icon="cash-outline" color={C.okInk} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.ink, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>Invoice #{v.number} due · {money(v.amount + v.tax)}</Text>
                  <Text style={{ color: C.muted, fontSize: 12.5 }} numberOfLines={1}>{est.title} · balance {money(contractTotals(est, profile!, c).balance)}</Text>
                </View>
              </Pressable>
            ))}
            <Button title={dayLabel(day, today) === 'Today' ? 'Add to today' : `Add to ${dayLabel(day, today)}`} icon="add" onPress={() => router.push(`/event?date=${day}`)} style={{ height: 44 }} />
          </Panel>
          {next.length ? (
            <Panel title="Coming up">
              {next.map((e) => <EventLine key={e.id} e={e} sub={[dayLabel(e.date, today), startTime(e.time), jobName(e)].filter(Boolean).join(' · ')} />)}
            </Panel>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function Dot({ icon, color }: { icon: IconName; color: string }) {
  return (
    <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: `${color}22`, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={17} color={color} />
    </View>
  );
}

function EventLine({ e, sub }: { e: CalEvent; sub: string }) {
  const k = KINDS[e.kind];
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={e.title} onPress={() => router.push(`/event?id=${e.id}`)}
      style={hoverStyle((hovered) => ({ flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, opacity: e.done ? 0.55 : hovered ? 0.8 : 1, ...clickable }))}>
      <Dot icon={k.icon as IconName} color={k.color} />
      <View style={{ flex: 1 }}>
        <Text raw style={{ color: C.ink, fontSize: 14, fontWeight: '600', textDecorationLine: e.done ? 'line-through' : 'none' }} numberOfLines={1}>{e.title}</Text>
        <Text style={{ color: C.muted, fontSize: 12.5 }} numberOfLines={1}>{sub}</Text>
      </View>
    </Pressable>
  );
}
