import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { money } from '@/engine/format';
import { periodRange, sheetCsv, sheetRows, type SheetPeriod, type SheetRow } from '@/engine/sheet';
import { useApp } from '@/store/AppContext';
import { Banner, Button, C, Card, Chip, H2, Muted, Screen, Segmented, Stat, mono } from '@/ui/kit';
import { shareTextFile } from '@/ui/shareFile';
import { Text } from '@/ui/text';
import { useToday } from '@/ui/useToday';
import { useWide } from '@/ui/wide';

const PERIODS: { value: SheetPeriod; label: string }[] = [
  { value: 'month', label: 'This month' }, { value: 'quarter', label: 'This quarter' }, { value: 'year', label: 'This year' }, { value: 'all', label: 'All time' },
];
type Which = 'all' | 'active' | 'done';
const ROW = 54;
const JOB_W_PHONE = 112;
// The three numbers a contractor asks for first sit beside the job; the rest are a swipe away.
const COLS: { key: keyof SheetRow; label: string }[] = [
  { key: 'revenue', label: 'Revenue' }, { key: 'cost', label: 'Cost' }, { key: 'profit', label: 'Profit' }, { key: 'marginPct', label: 'Margin' },
  { key: 'received', label: 'Received' }, { key: 'materials', label: 'Materials' }, { key: 'labor', label: 'Labor' }, { key: 'subs', label: 'Subs' }, { key: 'equipment', label: 'Equipment' },
];

/**
 * The money sheet: every job on one page, with what it brings in, what it has cost by kind and what is left. The
 * numbers are the ones each job's Money tab shows. Only the contractor's own accounts open this; nothing here goes to
 * a client or the crew.
 */
export default function Books() {
  const { projects, estimates, contracts, profile } = useApp();
  const today = useToday();
  const [period, setPeriod] = useState<SheetPeriod>('all');
  const [which, setWhich] = useState<Which>('all');
  const [note, setNote] = useState<string | null>(null);
  const [wide, setWide] = useState(0);
  // On a computer screen the job's name gets room to be read.
  const JOB_W = useWide() ? 240 : JOB_W_PHONE;
  // On a phone exactly three number columns fit; on a wide screen all of them do.
  const room = Math.max(0, wide - JOB_W - 2);
  const fitsAll = room >= COLS.length * 92;
  const COL_W = room ? Math.max(80, Math.floor(room / (fitsAll ? COLS.length : 3))) : 82;

  const { rows, total } = useMemo(
    () => sheetRows({ projects, estimates, contracts, profile, today, ...periodRange(period, today), ...(which === 'all' ? {} : { status: which }) }),
    [projects, estimates, contracts, profile, today, period, which],
  );
  const inPeriod = period !== 'all';

  const exportCsv = async () => {
    setNote(null);
    const label = period === 'all' ? 'all time' : PERIODS.find((p) => p.value === period)!.label.toLowerCase();
    try {
      const ok = await shareTextFile(`Studwise money sheet ${label} ${today}.csv`, sheetCsv(rows, total), 'text/csv', 'public.comma-separated-values-text');
      if (!ok) setNote('This device cannot share files. Open Studwise on a computer to download the sheet.');
    } catch {
      setNote('Could not make the file. Try again.');
    }
  };

  const value = (r: SheetRow, key: keyof SheetRow) => (key === 'marginPct' ? (r.revenue > 0 ? `${r.marginPct}%` : '') : money(r[key] as number));
  const tint = (r: SheetRow, key: keyof SheetRow) => (key === 'profit' && r.profit < 0 ? C.danger : key === 'profit' || key === 'cost' || key === 'revenue' ? C.ink : C.ink2);

  return (
    <Screen size="sheet">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {PERIODS.map((p) => <Chip key={p.value} label={p.label} selected={period === p.value} onPress={() => setPeriod(p.value)} />)}
      </View>
      <Segmented<Which> value={which} onChange={setWhich}
        options={[{ value: 'all', label: 'All jobs' }, { value: 'active', label: 'Active' }, { value: 'done', label: 'Finished' }]} />

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Stat label={inPeriod ? 'Invoiced' : 'Revenue'} value={money(total.revenue)} />
        <Stat label="Cost" value={money(total.cost)} />
        <Stat label="Profit" value={money(total.profit)} tone={total.profit < 0 ? 'warn' : 'ok'} />
      </View>

      {rows.length === 0 ? (
        <Card>
          <H2>{projects.length ? 'Nothing in this period' : 'No jobs yet'}</H2>
          <Muted>{projects.length
            ? 'No job has a cost, an invoice or a payment dated in this period. Pick a longer period.'
            : 'A job shows up here when its quote is signed. Its costs come from receipts, crew days and what you type in the job’s Money tab.'}</Muted>
        </Card>
      ) : (
        <View onLayout={(e) => setWide(Math.round(e.nativeEvent.layout.width))}
          style={{ flexDirection: 'row', borderWidth: 1, borderColor: C.line, borderRadius: 14, overflow: 'hidden', backgroundColor: C.card }}>
          {/* The job column stays put while the numbers scroll sideways. */}
          <View style={{ width: JOB_W, borderRightWidth: 1, borderRightColor: C.line }}>
            <View style={{ height: 40, justifyContent: 'center', paddingHorizontal: 12, backgroundColor: C.panel }}>
              <Text style={{ color: C.muted, fontSize: 13, fontWeight: '600' }}>Job</Text>
            </View>
            {rows.map((r) => (
              <Pressable key={r.projectId} accessibilityRole="button" accessibilityLabel={`Open the money for ${r.title}`} onPress={() => router.push(`/site/${r.projectId}/money`)}
                style={({ pressed }) => ({ height: ROW, justifyContent: 'center', paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: C.lineSoft, backgroundColor: pressed ? C.cardHi : 'transparent' })}>
                <Text raw style={{ color: C.ink, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{r.title}</Text>
                <Text raw style={{ color: r.status === 'active' ? C.accent : C.muted, fontSize: 12, fontFamily: mono }} numberOfLines={1}>{r.code}</Text>
              </Pressable>
            ))}
            <View style={{ height: ROW, justifyContent: 'center', paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.panel }}>
              <Text style={{ color: C.ink, fontSize: 14, fontWeight: '700' }}>Total</Text>
            </View>
          </View>
          <ScrollView horizontal scrollEnabled={!fitsAll} accessibilityLabel="Numbers for each job. Scroll sideways for more.">
            <View>
              <View style={{ flexDirection: 'row', height: 40, alignItems: 'center', backgroundColor: C.panel }}>
                {COLS.map((c) => (
                  <Text key={c.key} style={{ width: COL_W, textAlign: 'right', paddingRight: 10, color: C.muted, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
                    {c.key === 'revenue' && inPeriod ? 'Invoiced' : c.label}
                  </Text>
                ))}
              </View>
              {rows.map((r) => (
                <View key={r.projectId} style={{ flexDirection: 'row', height: ROW, alignItems: 'center', borderTopWidth: 1, borderTopColor: C.lineSoft }}>
                  {COLS.map((c) => (
                    <Text raw key={c.key} numberOfLines={1} adjustsFontSizeToFit style={{ width: COL_W, textAlign: 'right', paddingRight: 10, fontFamily: mono, fontSize: 14, color: tint(r, c.key) }}>{value(r, c.key)}</Text>
                  ))}
                </View>
              ))}
              <View style={{ flexDirection: 'row', height: ROW, alignItems: 'center', borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.panel }}>
                {COLS.map((c) => (
                  <Text raw key={c.key} numberOfLines={1} adjustsFontSizeToFit style={{ width: COL_W, textAlign: 'right', paddingRight: 10, fontFamily: mono, fontSize: 14, fontWeight: '700', color: c.key === 'profit' && total.profit < 0 ? C.danger : C.ink }}>{value(total, c.key)}</Text>
                ))}
              </View>
            </View>
          </ScrollView>
        </View>
      )}

      {note ? <Banner tone="warn" title={note} /> : null}
      {rows.length ? <Button title="Export for a spreadsheet" icon="download-outline" kind="secondary" onPress={exportCsv} /> : null}
      <Muted style={{ fontSize: 13 }}>
        {inPeriod
          ? 'For a period: Invoiced is what you billed in it before sales tax, Received is what came in, and costs are the ones dated in it.'
          : 'Revenue is the contract price with change orders, before sales tax. Costs come from receipts, crew days and what you typed in each job.'}
      </Muted>
      {rows.length && !fitsAll ? <Muted style={{ fontSize: 13 }}>Swipe the numbers sideways for money received and the cost by kind.</Muted> : null}
      <Muted style={{ fontSize: 13 }}>Tap a job to open its money. This sheet is for you: clients and crew never see cost or profit.</Muted>
    </Screen>
  );
}
