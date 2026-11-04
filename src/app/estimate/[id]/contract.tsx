import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import {
  billItems, changedSinceSigned, contractTotals, emptyContract, invoiceHtml, invoiceStates, termsFrom, termsOf, type BillItem, type Contract,
  type InvoiceState, type PayMethod,
} from '@/engine/contract';
import { dateFmt, money, newId } from '@/engine/format';
import { addDays } from '@/engine/schedule';
import type { Lang } from '@/engine/types';
import { useApp } from '@/store/AppContext';
import { Art } from '@/ui/art';
import { Badge, Banner, Button, C, Card, Chip, Field, H2, Muted, NumberField, Screen, Section, Segmented, Stat, mono } from '@/ui/kit';
import { Progress, Reveal } from '@/ui/motion';
import { confirmAction, notify } from '@/ui/notify';
import { sharePdf } from '@/ui/share';
import { Text } from '@/ui/text';
import { useToday } from '@/ui/useToday';

const METHODS: { value: PayMethod; label: string }[] = [
  { value: 'check', label: 'Check' }, { value: 'zelle', label: 'Zelle' }, { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' }, { value: 'transfer', label: 'Bank transfer' }, { value: 'other', label: 'Other' },
];
const STATE: Record<InvoiceState, { label: string; tone: 'ok' | 'info' | 'warn' | 'bad' }> = {
  paid: { label: 'Paid', tone: 'ok' }, partial: { label: 'Part paid', tone: 'info' }, open: { label: 'Sent', tone: 'info' }, overdue: { label: 'Overdue', tone: 'bad' },
};

/** Everything after the yes: signature, change orders, invoices and payments for one job. */
export default function ContractScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { estimates, profile, contracts, updateContract, issueInvoice } = useApp();
  const today = useToday();
  const est = estimates.find((e) => e.id === id);
  const c = contracts.find((x) => x.estimateId === id) ?? emptyContract(id ?? '');
  const [lang, setLang] = useState<Lang>(profile?.quoteLanguage ?? 'en');
  const [dueDays, setDueDays] = useState(7);
  const [busy, setBusy] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState<PayMethod>('check');
  const [payNote, setPayNote] = useState('');
  if (!est || !profile) return <Screen><Muted>Estimate not found.</Muted></Screen>;

  const t = contractTotals(est, profile, c);
  const items = billItems(est, profile, c);
  const states = invoiceStates(c, today, termsOf(est, profile, c).salesTaxPct);

  const invoice = async (item: BillItem) => {
    setBusy(item.key);
    try {
      const inv = item.invoice
        ?? issueInvoice(est.id, { id: newId(), date: today, dueDate: addDays(today, dueDays), itemKey: item.key, label: item.label, amount: item.amount, tax: item.tax });
      if (!inv) return;
      const withInv: Contract = { ...c, terms: c.terms ?? termsFrom(est, profile), invoices: c.invoices.some((v) => v.id === inv.id) ? c.invoices : [...c.invoices, inv] };
      await sharePdf(invoiceHtml(est, profile, withInv, inv, lang), `Invoice ${inv.number} — ${est.title}`);
    } catch {
      notify('Could not create the invoice', 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  // The change order is only saved once something is typed in it (backing out leaves nothing behind).
  const newChange = () => router.push(`/estimate/${est.id}/change?co=new`);

  const recordPayment = () => {
    if (!(payAmount > 0)) return;
    const p = { id: newId(), date: today, amount: Math.round(payAmount * 100) / 100, method: payMethod, note: payNote.trim() };
    updateContract(est.id, (x) => ({ ...x, payments: [...x.payments, p] }));
    setPayOpen(false); setPayAmount(0); setPayNote('');
    notify('Payment recorded', `${money(p.amount)} by ${METHODS.find((m) => m.value === p.method)?.label}.`);
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Contract & payments' }} />
      <Reveal style={{ gap: 4 }}>
        <Text style={{ color: C.ink, fontSize: 22, fontWeight: '800' }}>{est.title}</Text>
        <Muted>{[est.clientName, est.address].filter(Boolean).join(' · ')}</Muted>
      </Reveal>

      <Reveal index={1}>
        <Card style={{ backgroundColor: C.dark }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Muted>Contract total</Muted>
            <Text style={{ color: C.accent, fontSize: 30, fontWeight: '800', fontFamily: mono }}>{money(t.total)}</Text>
          </View>
          <Progress value={t.total > 0 ? t.paid / t.total : 0} color={C.okInk} />
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Stat label="Paid" value={money(t.paid)} tone="ok" />
            <Stat label="Balance" value={money(t.balance)} tone={t.balance > 0 ? 'accent' : 'ok'} />
            {t.due > 0 ? <Stat label="Invoiced, unpaid" value={money(t.due)} tone="warn" /> : null}
          </View>
          {t.changes ? <Muted style={{ fontSize: 13 }}>Original {money(t.original)} + change orders {money(t.changesWithTax)} (with tax)</Muted> : null}
        </Card>
      </Reveal>

      {c.accepted ? (
        <Pressable accessibilityRole="button" onPress={() => router.push(`/estimate/${est.id}/sign`)}>
          <Banner tone={changedSinceSigned(est, c) ? 'warn' : 'ok'} title={`Signed by ${c.accepted.name} · ${dateFmt(c.accepted.signedAt)}`}>
            {changedSinceSigned(est, c) ? `The quote changed after signing (${money(c.accepted.total)} then, ${money(est.total)} now). Tap to review.` : 'Tap to see the signature or share the signed quote.'}
          </Banner>
        </Pressable>
      ) : (
        <Card>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <Art name="sign" width={96} />
            <View style={{ flex: 1, gap: 2 }}>
              <H2>Not signed yet</H2>
              <Muted style={{ fontSize: 13 }}>Your client can sign the quote right on your phone.</Muted>
            </View>
          </View>
          <Button title="Client signs the quote" icon="create-outline" onPress={() => router.push(`/estimate/${est.id}/sign`)} />
        </Card>
      )}

      <Segmented<Lang> value={lang} onChange={setLang} options={[{ value: 'en', label: 'Documents in English' }, { value: 'vi', label: 'Tiếng Việt' }]} />

      <Section title="Change orders" />
      <Card style={{ gap: 0, paddingVertical: 6 }}>
        {c.changeOrders.length === 0 ? <Muted style={{ fontSize: 13, paddingVertical: 8 }}>Extra work or changes the client asks for. Price it, the client signs, and it’s added to the contract.</Muted> : null}
        {[...c.changeOrders].sort((a, b) => a.number - b.number).map((co) => (
          <Pressable key={co.id} accessibilityRole="button" onPress={() => router.push(`/estimate/${est.id}/change?co=${co.id}`)}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderColor: C.lineSoft, opacity: pressed ? 0.7 : 1 })}>
            <Text style={{ color: C.muted, fontWeight: '700', width: 30 }}>#{co.number}</Text>
            <Text style={{ flex: 1, color: C.ink, fontWeight: '600' }} numberOfLines={1}>{co.title || 'Untitled change'}</Text>
            <Text style={{ color: C.ink, fontFamily: mono }}>{money(co.amount)}</Text>
            <Badge label={co.status === 'approved' ? 'Signed' : co.status === 'declined' ? 'Declined' : 'Waiting'} tone={co.status === 'approved' ? 'ok' : co.status === 'declined' ? 'bad' : 'warn'} />
          </Pressable>
        ))}
        <Button kind="ghost" title="+ New change order" onPress={newChange} />
      </Card>

      <Section title="Invoices" />
      <Card style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <Muted style={{ fontSize: 13 }}>New invoices due:</Muted>
          {[0, 7, 15, 30].map((d) => <Chip key={d} label={d === 0 ? 'On receipt' : `${d} days`} selected={dueDays === d} onPress={() => setDueDays(d)} />)}
        </View>
        {items.map((it) => {
          const st = it.invoice ? states[it.invoice.id] : undefined;
          return (
            <View key={it.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderColor: C.lineSoft }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: C.ink, fontWeight: '600' }}>{it.label}</Text>
                <Text style={{ color: C.muted, fontSize: 12 }}>
                  {it.credit ? `${money(it.amount + it.tax)} with tax · taken off the balance` : `${money(it.amount)} + tax ${money(it.tax)}`}{it.invoice ? ` · #${it.invoice.number} · due ${dateFmt(`${it.invoice.dueDate}T12:00:00`)}` : ''}
                </Text>
              </View>
              {it.credit ? <Badge label="Credit" tone="ok" /> : st ? <Badge label={STATE[st.state].label} tone={STATE[st.state].tone} /> : null}
              {it.credit ? null : <Pressable accessibilityRole="button" accessibilityLabel={it.invoice ? `Share invoice ${it.invoice.number}` : `Create invoice for ${it.label}`}
                disabled={!!busy} onPress={() => invoice(it)}
                style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: it.invoice ? C.cardHi : C.accent }}>
                <Text style={{ color: it.invoice ? C.ink : C.onAccent, fontWeight: '700', fontSize: 13 }}>
                  {busy === it.key ? '…' : it.invoice ? 'Share' : 'Invoice'}
                </Text>
              </Pressable>}
            </View>
          );
        })}
      </Card>

      <Section title="Payments received" />
      <Card style={{ gap: 6 }}>
        {c.payments.length === 0 && !payOpen ? <Muted style={{ fontSize: 13 }}>Record each check, Zelle or cash payment so you always know the balance.</Muted> : null}
        {[...c.payments].sort((a, b) => b.date.localeCompare(a.date)).map((p) => (
          <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
            <Ionicons name="checkmark-circle" size={20} color={C.okInk} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.ink, fontWeight: '600' }}>{money(p.amount)} · {METHODS.find((m) => m.value === p.method)?.label}</Text>
              <Text style={{ color: C.muted, fontSize: 12 }}>{dateFmt(`${p.date}T12:00:00`)}{p.note ? ` · ${p.note}` : ''}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Delete payment" hitSlop={8}
              onPress={() => confirmAction('Delete this payment?', money(p.amount), 'Delete', () => updateContract(est.id, (x) => ({ ...x, payments: x.payments.filter((y) => y.id !== p.id) })))}>
              <Ionicons name="trash-outline" size={18} color={C.muted} />
            </Pressable>
          </View>
        ))}
        {payOpen ? (
          <View style={{ gap: 10, borderTopWidth: c.payments.length ? 1 : 0, borderColor: C.lineSoft, paddingTop: 10 }}>
            <NumberField label="Amount received" suffix="$" value={payAmount} onChange={setPayAmount} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {METHODS.map((m) => <Chip key={m.value} label={m.label} selected={payMethod === m.value} onPress={() => setPayMethod(m.value)} />)}
            </View>
            <Field label="Note (optional)" value={payNote} onChangeText={setPayNote} placeholder="e.g. Check #1042" maxLength={300} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button kind="secondary" title="Cancel" style={{ flex: 1 }} onPress={() => setPayOpen(false)} />
              <Button title="Save payment" style={{ flex: 1 }} disabled={!(payAmount > 0)} onPress={recordPayment} />
            </View>
          </View>
        ) : (
          <Button kind="secondary" title="Record a payment" icon="cash-outline" onPress={() => { setPayAmount(t.due > 0 ? t.due : 0); setPayOpen(true); }} />
        )}
      </Card>
    </Screen>
  );
}
