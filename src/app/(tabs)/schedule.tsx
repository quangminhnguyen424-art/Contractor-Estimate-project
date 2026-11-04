import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { contractTotals, invoiceStates } from '@/engine/contract';
import { money } from '@/engine/format';
import { addDays, dayLabel, eventsOn, KINDS, timeLabel, upcoming, type CalEvent } from '@/engine/schedule';
import { useApp } from '@/store/AppContext';
import { Button, C, Card, Empty, Muted, Screen, Section } from '@/ui/kit';
import { PressScale, Reveal } from '@/ui/motion';
import { remindersAvailable } from '@/ui/reminders';
import { Text } from '@/ui/text';
import { useToday } from '@/ui/useToday';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** The calendar: pick a day on the strip, see what's on, add site visits, crew days, calls and inspections. */
export default function ScheduleScreen() {
  const { events, estimates, contracts, projects, profile } = useApp();
  const today = useToday();
  const [day, setDay] = useState(today);
  const days = Array.from({ length: 45 }, (_, i) => addDays(today, i - 3));
  const onDay = eventsOn(events, day);
  const next = upcoming(events, today, 14).filter((e) => e.date !== day).slice(0, 8);

  // Invoices due on the chosen day that aren't fully paid.
  const dueInvoices = contracts.flatMap((c) => {
    const est = estimates.find((e) => e.id === c.estimateId);
    if (!est || !profile) return [];
    const st = invoiceStates(c, today, est.salesTaxPct);
    return c.invoices.filter((v) => v.dueDate === day && st[v.id]?.state !== 'paid').map((v) => ({ v, est }));
  });

  const jobName = (e: CalEvent) =>
    projects.find((p) => p.id === e.projectId)?.title ?? estimates.find((x) => x.id === e.estimateId)?.title ?? '';

  return (
    <Screen footer={<Button title={`Add to ${dayLabel(day, today).toLowerCase() === 'today' ? 'today' : dayLabel(day, today)}`} icon="add" onPress={() => router.push(`/event?date=${day}`)} />}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
        contentOffset={{ x: 3 * 62 - 8, y: 0 }}>
        {days.map((d) => {
          const on = d === day;
          const date = new Date(`${d}T12:00:00`);
          const count = events.filter((e) => e.date === d).length;
          return (
            <PressScale key={d} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={dayLabel(d, today)} onPress={() => setDay(d)}
              style={{ width: 54, paddingVertical: 10, borderRadius: 6, alignItems: 'center', gap: 4, backgroundColor: on ? C.accent : C.card, borderWidth: 1, borderColor: on ? C.accent : d === today ? C.sky : C.line }}>
              <Text style={{ color: on ? C.onAccent : C.muted, fontSize: 11, fontWeight: '600' }}>{date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}</Text>
              <Text style={{ color: on ? C.onAccent : C.ink, fontSize: 19, fontWeight: '800' }}>{date.getDate()}</Text>
              <View style={{ flexDirection: 'row', gap: 2, height: 6 }}>
                {Array.from({ length: Math.min(3, count) }, (_, i) => <View key={i} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: on ? C.onAccent : C.accent }} />)}
              </View>
            </PressScale>
          );
        })}
      </ScrollView>

      <Section title={dayLabel(day, today) + (day !== today ? '' : ` · ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`)} />
      {onDay.length === 0 && dueInvoices.length === 0 ? (
        <Empty art="calendar" title="Nothing scheduled" text="Add site visits, crew days, client calls, deliveries and inspections. You’ll get a reminder on your phone." width={220} />
      ) : null}
      {onDay.map((e, i) => <EventRow key={e.id} e={e} job={jobName(e)} index={i} />)}
      {dueInvoices.map(({ v, est }) => (
        <Pressable key={v.id} accessibilityRole="button" onPress={() => router.push(`/estimate/${est.id}/contract`)}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <IconDot icon="cash-outline" color={C.okInk} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.ink, fontWeight: '700' }}>Invoice #{v.number} due · {money(v.amount + v.tax)}</Text>
              <Text style={{ color: C.muted, fontSize: 13 }}>{est.title} · balance {money(contractTotals(est, profile!, contracts.find((c) => c.estimateId === est.id)!).balance)}</Text>
            </View>
          </Card>
        </Pressable>
      ))}

      {next.length ? <Section title="Coming up" /> : null}
      {next.map((e, i) => <EventRow key={e.id} e={e} job={jobName(e)} index={i} showDay today={today} />)}
      {!remindersAvailable ? <Muted style={{ fontSize: 12 }}>Reminders ring on your phone in the installed iPhone app.</Muted> : null}
    </Screen>
  );
}

function IconDot({ icon, color }: { icon: IconName; color: string }) {
  return (
    <View style={{ width: 42, height: 42, borderRadius: 6, backgroundColor: `${color}22`, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={21} color={color} />
    </View>
  );
}

function EventRow({ e, job, index, showDay, today }: { e: CalEvent; job: string; index: number; showDay?: boolean; today?: string }) {
  const k = KINDS[e.kind];
  return (
    <Reveal index={index}>
      <PressScale accessibilityRole="button" accessibilityLabel={e.title} onPress={() => router.push(`/event?id=${e.id}`)} scaleTo={0.98}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 6, borderWidth: 1, borderColor: C.line, padding: 12, opacity: e.done ? 0.55 : 1 }}>
        <IconDot icon={k.icon as IconName} color={k.color} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: C.ink, fontWeight: '700', textDecorationLine: e.done ? 'line-through' : 'none' }} numberOfLines={1}>{e.title}</Text>
          <Text style={{ color: C.muted, fontSize: 13 }} numberOfLines={1}>
            {showDay && today ? `${dayLabel(e.date, today)} · ` : ''}{timeLabel(e)}{job ? ` · ${job}` : ''}
          </Text>
        </View>
        {e.remindMin !== null && !e.done ? <Ionicons name="notifications-outline" size={16} color={C.muted} /> : null}
      </PressScale>
    </Reveal>
  );
}
