import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { COST_KINDS, emptyMoney, KIND_ORDER, projectBooks, type CostEntry } from '@/engine/books';
import { money, money2 } from '@/engine/format';
import { useApp } from '@/store/AppContext';
import { Banner, Button, C, Card, H2, Muted, NumberField, Row, Screen } from '@/ui/kit';
import { confirmAction } from '@/ui/notify';
import { Text } from '@/ui/text';
import { useToday } from '@/ui/useToday';

/** One heading band, like the dark headers on the Project Dashboard sheet. */
function Band({ title }: { title: string }) {
  return (
    <View style={{ backgroundColor: C.cardHi, borderRadius: 4, paddingVertical: 8, paddingHorizontal: 10 }}>
      <Text style={{ color: C.ink, fontWeight: '700', letterSpacing: 0.6, fontSize: 13 }}>{title}</Text>
    </View>
  );
}

function Bar({ value, max, over }: { value: number; max: number; over?: boolean }) {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: C.line, overflow: 'hidden' }}>
      <View style={{ width: `${Math.round(pct * 100)}%`, height: 6, backgroundColor: over ? C.danger : C.accent }} />
    </View>
  );
}

/** The job's money: what it sells for, what it has cost, the profit, the owner's money, and taxes to set aside. */
export default function MoneyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { projects, estimates, contracts, profile, updateMoney, deletePhotosLater } = useApp();
  const today = useToday();
  const p = projects.find((x) => x.id === id);
  if (!p) return <Screen><Muted>This job site was deleted.</Muted></Screen>;
  const est = estimates.find((e) => e.id === p.estimateId);
  const contract = contracts.find((c) => c.estimateId === p.estimateId);
  const m = p.money ?? emptyMoney();
  const b = projectBooks({ est, profile, contract, money: m, today });
  const costs = [...m.costs].sort((a, c) => c.date.localeCompare(a.date) || c.createdAt.localeCompare(a.createdAt));

  const remove = (c: CostEntry) =>
    confirmAction('Delete this cost?', `${c.vendor || COST_KINDS[c.kind].en} · ${money2(c.amount)}`, 'Delete',
      () => {
        updateMoney(p.id, (x) => ({ ...x, costs: x.costs.filter((y) => y.id !== c.id) }));
        if (c.receiptUri) deletePhotosLater([c.receiptUri]);
      });
  const markReimbursed = (c: CostEntry) =>
    updateMoney(p.id, (x) => ({ ...x, costs: x.costs.map((y) => (y.id === c.id && y.ownerOwes ? { ...y, ownerOwes: { ...y.ownerOwes, paidOn: today } } : y)) }));

  const statusText = { none: '—', ok: 'OK', low: 'Low · request soon', request: 'Request deposit' }[b.funds.status];

  return (
    <Screen footer={(
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button title="Snap receipt" icon="camera-outline" style={{ flex: 1 }} onPress={() => router.push(`/site/${p.id}/cost?receipt=1`)} />
        <Button kind="secondary" title="Add cost" icon="add" style={{ flex: 1 }} onPress={() => router.push(`/site/${p.id}/cost`)} />
      </View>
    )}>
      <View style={{ gap: 2 }}>
        <Text style={{ color: C.ink, fontSize: 22, fontWeight: '800' }}>{p.title}</Text>
        <Muted style={{ fontSize: 13 }}>Private to you. Never shown on client or crew documents.</Muted>
      </View>

      {b.funds.status === 'request' ? (
        <Banner tone="warn" title={`Request a deposit: you are ${money(-b.funds.spendable)} out of pocket`}>
          The owner has paid {money(b.funds.deposited)}; the job has cost {money(b.funds.spent)} so far.
        </Banner>
      ) : null}
      {b.over.map((o) => (
        <Banner key={o.kind} tone="warn" title={`${COST_KINDS[o.kind].en} is ${o.pct}% over budget (${money(o.amount)})`}>
          Extra work the client asked for? Turn it into a change order before you forget.
        </Banner>
      ))}
      {b.owner.overdueCount > 0 ? (
        <Banner tone="warn" title={`${b.owner.overdueCount} overdue item${b.owner.overdueCount > 1 ? 's' : ''} · ${money(b.owner.overdueAmount)}`}>
          {est ? 'Open Contract & payments to send a reminder.' : 'Mark items paid back below when the owner pays.'}
        </Banner>
      ) : null}

      <Card>
        <Band title="CONTRACT PRICE" />
        <Row left="Project estimate (base bid)" right={money2(b.contract.base)} />
        <Row left="Approved change orders" right={money2(b.contract.changes)} />
        <Row left="Contract price" right={money2(b.contract.price)} bold />
        {!est ? <Muted style={{ fontSize: 13 }}>No estimate is linked to this job site, so the price is $0.</Muted> : null}
      </Card>

      <Card>
        <Band title="ACTUAL COST TO DATE" />
        {KIND_ORDER.map((k) => (
          <View key={k} style={{ gap: 4 }}>
            <Row left={COST_KINDS[k].en} right={money2(b.cost[k])} sub={b.budget[k] > 0 ? `Budget ${money(b.budget[k])}` : undefined} />
            {b.budget[k] > 0 ? <Bar value={b.cost[k]} max={b.budget[k]} over={b.cost[k] > b.budget[k] * 1.05} /> : null}
          </View>
        ))}
        <Row left="Total cost" right={money2(b.cost.total)} bold />
      </Card>

      <Card>
        <Band title="PROFIT" />
        <Row left="Contract price" right={money2(b.contract.price)} />
        <Row left="Total cost" right={money2(b.cost.total)} />
        <Row left="Projected profit" right={money2(b.profit.amount)} bold />
        <Row left="Projected margin" right={`${b.profit.marginPct}%`} bold />
      </Card>

      <Card>
        <Band title="OWNER FUNDS & SPENDABLE BALANCE" />
        <Row left="Total owner deposited" right={money2(b.funds.deposited)} sub={est ? 'Payments recorded on the contract' : undefined} />
        <Row left="Spent so far (all costs)" right={money2(b.funds.spent)} />
        <Row left="Spendable balance left" right={money2(b.funds.spendable)} bold />
        <Row left="Status" right={statusText} bold />
      </Card>

      <Card>
        <Band title="OWNER REIMBURSEMENT" />
        <Row left="Total owner owes" right={money2(b.owner.owes)} sub="Invoices with tax + costs paid on the owner's behalf" />
        <Row left="Total received" right={money2(b.owner.received)} />
        <Row left="Balance still owed" right={money2(b.owner.balance)} bold />
        <Row left="Overdue items" right={String(b.owner.overdueCount)} />
        <Row left="Overdue amount" right={money2(b.owner.overdueAmount)} />
      </Card>

      <Card>
        <Band title="TAXES & TRUE PROFIT" />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <NumberField label="Sales tax at this address" suffix="%" value={b.tax.salesPct} style={{ flex: 1 }}
            onChange={(v) => updateMoney(p.id, (x) => ({ ...x, salesTaxPct: Math.max(0, Math.min(25, v)) }))} />
          <NumberField label="Income tax set aside" suffix="%" value={b.tax.incomePct} style={{ flex: 1 }}
            onChange={(v) => updateMoney(p.id, (x) => ({ ...x, incomeTaxPct: Math.max(0, Math.min(60, v)) }))} />
        </View>
        <Row left={`Sales tax owed (${b.tax.salesPct}%)`} right={money2(b.tax.sales)} sub="Collected from the client on top of the price" />
        <Row left={`Income tax on profit (${b.tax.incomePct}%)`} right={money2(b.tax.income)} />
        <Row left="Total tax reserve" right={money2(b.tax.reserve)} bold />
        <Row left="Net profit after tax" right={money2(b.tax.netAfterTax)} bold />
        <Row left="True net margin" right={`${b.tax.netMarginPct}%`} bold />
        <Muted style={{ fontSize: 12 }}>Washington sales tax depends on the job address. These are planning numbers, not tax advice; check with your CPA.</Muted>
      </Card>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <H2 style={{ flex: 1 }}>Costs</H2>
          <Button kind="ghost" title="Buy list" icon="cart-outline" onPress={() => router.push(`/site/${p.id}/buy`)} />
        </View>
        {costs.length === 0 ? <Muted>No costs yet. Snap a receipt, or add labor, subs and rentals by hand. Crew days you mark “Worked” are added for you.</Muted> : null}
        {costs.map((c) => (
          <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderColor: C.lineSoft }}>
            <Ionicons name={(c.receiptUri ? 'receipt-outline' : COST_KINDS[c.kind].icon) as never} size={20} color={C.accent} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.ink, fontWeight: '600' }}>{c.vendor || COST_KINDS[c.kind].en}</Text>
              <Text style={{ color: C.muted, fontSize: 12 }}>
                {c.date} · {COST_KINDS[c.kind].en}{c.note ? ` · ${c.note}` : ''}
                {c.ownerOwes ? (c.ownerOwes.paidOn ? ' · paid back' : ` · owner pays back by ${c.ownerOwes.due}`) : ''}
              </Text>
            </View>
            <Text style={{ color: C.ink, fontWeight: '700' }}>{money2(c.amount)}</Text>
            {c.ownerOwes && !c.ownerOwes.paidOn ? (
              <Button kind="ghost" title="Paid back" onPress={() => markReimbursed(c)} />
            ) : null}
            <Button kind="ghost" title="Edit" accessibilityLabel={`Edit ${c.vendor || 'cost'}`} onPress={() => router.push(`/site/${p.id}/cost?cost=${c.id}`)} />
            <Button kind="ghost" title="×" accessibilityLabel={`Delete ${c.vendor || 'cost'}`} onPress={() => remove(c)} />
          </View>
        ))}
      </Card>
    </Screen>
  );
}
