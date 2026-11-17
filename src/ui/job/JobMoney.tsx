import { router } from 'expo-router';
import { View } from 'react-native';

import { buyTotals, emptyMoney, projectBooks } from '@/engine/books';
import { money } from '@/engine/format';
import type { Job } from '@/engine/job';
import { useApp } from '@/store/AppContext';

import { List, ListRow, Muted, Section } from '../kit';
import { Text } from '../text';
import { C } from '../theme';
import { useToday } from '../useToday';

/** The job's money in one place: what the client pays, what came in, what it cost you. Private to the contractor. */
export function JobMoney({ job, needSite }: {
  job: Job;
  /** The job site id, made on first use: costs and the buy list live with the job site. */
  needSite: () => string | null;
}) {
  const { profile } = useApp();
  const today = useToday();
  const { est, project, contract } = job;
  const m = project?.money ?? emptyMoney();
  const books = project?.money?.costs.length || est ? projectBooks({ est, profile, contract, money: m, today }) : null;
  const buy = buyTotals(m.buy);
  const total = job.total ?? est?.total ?? 0;
  // Profit is the plan from a detailed estimate while the job runs, and the real number once the job is finished.
  const planned = est && est.mode === 'detailed' && est.cost > 0 ? est : null;
  const final = job.stage === 'done' && m.costs.length > 0 && books && est;
  const profit = final ? books.profit.amount : planned ? planned.price - planned.cost : null;
  const marginPct = final ? books.profit.marginPct : planned?.price ? Math.round(((planned.price - planned.cost) / planned.price) * 100) : 0;
  const site = (path: string) => { const pid = project?.id ?? needSite(); if (pid) router.push(`/site/${pid}/${path}` as never); };

  return (
    <>
      <View style={{ flexDirection: 'row', backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.line }}>
        <Num label="Client pays" value={est ? money(total) : '—'} />
        <Num label="Paid so far" value={money(job.paid)} divider />
        <Num label="Still owed" value={est ? money(Math.max(0, total - job.paid)) : '—'} divider bad={job.due > 0.5} sub={job.due > 0.5 ? `${money(job.due)} invoiced` : undefined} />
      </View>
      <View style={{ flexDirection: 'row', backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.line }}>
        <Num label="Your cost so far" value={books ? money(books.cost.total) : '$0'} sub={planned ? `of ${money(planned.cost)} planned` : undefined} />
        <Num label={final ? 'Profit' : 'Planned profit'} divider value={profit == null ? '—' : money(profit)}
          sub={profit == null ? 'Shown for detailed estimates' : `${marginPct}% margin`} />
      </View>
      <Muted style={{ fontSize: 12 }}>Private to you. Cost and profit never appear on client or crew documents.</Muted>

      <Section title="Money in" />
      <List>
        {est ? (
          <ListRow icon="wallet" title="Contract and payments" sub="Signature, deposit and invoices, change orders" right={job.due > 0.5 ? `${money(job.due)} due` : undefined}
            onPress={() => router.push(`/estimate/${est.id}/contract`)} />
        ) : (
          <ListRow icon="add-circle" title="Price this job" sub="Make an estimate to send a quote and invoices" onPress={() => router.dismissTo(`/new?project=${project?.id ?? ''}`)} />
        )}
      </List>

      <Section title="Money out" />
      <List>
        <ListRow icon="receipt" title="Costs and receipts" sub={m.costs.length ? `${m.costs.length} saved · snap a receipt and Studwise reads it` : 'Snap a receipt and Studwise reads it'} onPress={() => site('money')} />
        <ListRow icon="cart" title="Buy list" sub={buy.count ? `${buy.boughtCount} of ${buy.count} bought` : 'What to pick up, made from the estimate'} onPress={() => site('buy')} />
        {est?.mode === 'detailed' ? (
          <ListRow icon="list" title="Material list" sub={`${est.materials.length} items · ${money(est.materialTotal)} planned`} onPress={() => router.push(`/estimate/${est.id}/materials`)} />
        ) : null}
      </List>
    </>
  );
}

function Num({ label, value, sub, divider, bad }: { label: string; value: string; sub?: string; divider?: boolean; bad?: boolean }) {
  return (
    <View accessible accessibilityLabel={`${label} ${value}`} style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 12, gap: 2, borderLeftWidth: divider ? 1 : 0, borderColor: C.lineSoft }}>
      <Text style={{ color: C.muted, fontSize: 12, fontWeight: '500' }}>{label}</Text>
      <Text style={{ color: bad ? C.orangeInk : C.ink, fontSize: 19, fontWeight: '700' }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {sub ? <Text style={{ color: C.muted, fontSize: 11 }} numberOfLines={1}>{sub}</Text> : null}
    </View>
  );
}
