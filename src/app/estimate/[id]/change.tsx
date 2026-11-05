import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { changeOrderHtml, emptyContract, hasInk, nextChangeNo, signatureSvg, taxOn, termsOf, type ChangeOrder } from '@/engine/contract';
import { dateFmt, money, newId } from '@/engine/format';
import type { Lang } from '@/engine/types';
import { useApp } from '@/store/AppContext';
import { SendSignLink } from '@/ui/SendSignLink';
import { Badge, Banner, Button, C, Card, Field, H2, Muted, NumberField, P, Screen, Segmented } from '@/ui/kit';
import { confirmAction, notify } from '@/ui/notify';
import { sharePdf } from '@/ui/share';
import { SignaturePad } from '@/ui/SignaturePad';
import { celebrate } from '@/ui/celebrate';
import { Text } from '@/ui/text';

/** One change order: what changes and the price, then the client signs to approve it. */
export default function ChangeOrderScreen() {
  const params = useLocalSearchParams<{ id: string; co: string }>();
  const { estimates, profile, contracts, updateContract, emit } = useApp();
  const { width } = useWindowDimensions();
  const est = estimates.find((e) => e.id === params.id);
  const contract = contracts.find((c) => c.estimateId === params.id) ?? emptyContract(params.id ?? '');
  // A new change order ("co=new") is only saved once something is typed, so backing out leaves nothing behind.
  const [coId, setCoId] = useState(params.co === 'new' ? '' : params.co ?? '');
  const saved = contract.changeOrders.find((x) => x.id === coId);
  const [number] = useState(() => saved?.number ?? nextChangeNo(contract));
  const [title, setTitle] = useState(saved?.title ?? '');
  const [description, setDescription] = useState(saved?.description ?? '');
  const [credit, setCredit] = useState((saved?.amount ?? 0) < 0);
  const [amount, setAmount] = useState(Math.abs(saved?.amount ?? 0));
  const [name, setName] = useState(est?.clientName ?? '');
  const [strokes, setStrokes] = useState<number[][]>([]);
  const [drawing, setDrawing] = useState(false);
  const [lang, setLang] = useState<Lang>(profile?.quoteLanguage ?? 'en');
  const [busy, setBusy] = useState(false);
  if (!est || !profile) return <Screen><Muted>Estimate not found.</Muted></Screen>;
  if (coId && !saved) return <Screen><Muted>This change order was deleted.</Muted></Screen>;
  const padW = Math.min(width, 760) - 32;
  const status = saved?.status ?? 'pending';
  const locked = status !== 'pending';
  const pct = termsOf(est, profile, contract).salesTaxPct;
  const value = (c: boolean, a: number) => Math.round((c ? -a : a) * 100) / 100;
  const invoiced = !!saved && contract.invoices.some((v) => v.itemKey === `co:${saved.id}`);

  /** Saves what's on screen (creating the change order the first time). */
  const persist = (patch: Partial<ChangeOrder> = {}): ChangeOrder => {
    const base: ChangeOrder = saved ?? { id: coId || newId(), number, title: '', description: '', amount: 0, status: 'pending', createdAt: new Date().toISOString() };
    const next: ChangeOrder = { ...base, title: title.trim(), description, amount: value(credit, amount), ...patch };
    updateContract(est.id, (c) => ({ ...c, changeOrders: [...c.changeOrders.filter((x) => x.id !== next.id), next] }));
    if (!coId) setCoId(next.id);
    return next;
  };
  const autosave = (patch: Partial<ChangeOrder>) => { if (saved && !locked) persist(patch); };

  const approve = () => {
    if (!title.trim()) return notify('Add a short title', 'For example "Add recessed lights in hallway".');
    if (!(amount > 0)) return notify('Add the price', 'Type the price change before the client signs (a credit if work is removed).');
    if (!name.trim() || !hasInk(strokes)) return notify('Client signature needed', 'The client types their name and signs in the white box.');
    const now = new Date().toISOString();
    const co = persist({ status: 'approved', decidedAt: now, signature: { name: name.trim(), strokes, w: padW, h: 170, signedAt: now } });
    emit('change.approved', { estimate: { id: est.id, title: est.title, client: est.clientName }, changeOrder: { number: co.number, title: co.title, amount: co.amount, signedBy: name.trim() } });
    celebrate();
    notify(`Change order #${number} approved`, credit ? 'The credit is taken off the contract balance.' : `${money(value(credit, amount))} + tax is added to the contract and can be invoiced.`);
  };

  const share = async () => {
    setBusy(true);
    try {
      const cur = locked && saved ? saved : persist();
      const withCur = { ...contract, changeOrders: [...contract.changeOrders.filter((x) => x.id !== cur.id), cur] };
      await sharePdf(changeOrderHtml(est, profile, withCur, cur, lang), `Change order ${cur.number} — ${est.title}`);
    } catch {
      notify('Could not create the PDF', 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const shown = saved && locked ? saved : null;
  return (
    <Screen scrollEnabled={!drawing}>
      <Stack.Screen options={{ title: `Change order #${number}` }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ color: C.ink, fontSize: 20, fontWeight: '800', flex: 1 }}>{est.title}</Text>
        <Badge label={status === 'approved' ? 'Signed' : status === 'declined' ? 'Declined' : 'Waiting for client'} tone={status === 'approved' ? 'ok' : status === 'declined' ? 'bad' : 'warn'} />
      </View>

      {shown ? (
        <Card>
          <H2>{shown.title}</H2>
          {shown.description ? <Text style={{ color: C.ink2, lineHeight: 21 }}>{shown.description}</Text> : null}
          <Text style={{ color: C.accent, fontSize: 24, fontWeight: '800', fontFamily: '__numbers__' }}>{money(shown.amount)} <Text style={{ color: C.muted, fontSize: 14 }}>+ {money(taxOn(shown.amount, pct))} tax</Text></Text>
          {shown.signature ? (
            <View style={{ backgroundColor: P.paper, borderRadius: 6, padding: 10, gap: 4 }}>
              <SvgXml xml={signatureSvg(shown.signature, '#0F172A')} width={padW - 52} height={Math.round(((padW - 52) * shown.signature.h) / shown.signature.w)} />
              <Text style={{ color: P.muted, fontSize: 12 }}>{shown.signature.name} · {dateFmt(shown.signature.signedAt)}</Text>
            </View>
          ) : null}
        </Card>
      ) : (
        <Card>
          <Field label="What changes" value={title} onChangeText={(v) => { setTitle(v); autosave({ title: v.trim() }); }} maxLength={120} placeholder="e.g. Add 4 recessed lights in hallway" />
          <Field label="Details (shown to the client)" multiline value={description} onChangeText={(v) => { setDescription(v); autosave({ description: v }); }}
            placeholder="Materials, where, anything that changes in the schedule." />
          <Segmented<'add' | 'credit'> value={credit ? 'credit' : 'add'} onChange={(v) => { setCredit(v === 'credit'); autosave({ amount: value(v === 'credit', amount) }); }}
            options={[{ value: 'add', label: 'Adds to price' }, { value: 'credit', label: 'Credit (work removed)' }]} />
          <NumberField label="Price before tax" suffix="$" value={amount} onChange={(n) => { setAmount(n); autosave({ amount: value(credit, n) }); }} />
          <Muted style={{ fontSize: 13 }}>{money(value(credit, amount))} + {pct}% tax {money(taxOn(value(credit, amount), pct))} = {money(value(credit, amount) + taxOn(value(credit, amount), pct))}</Muted>
          {!saved && (title.trim() || amount > 0) ? <Button kind="secondary" title="Save as waiting for client" onPress={() => { persist(); notify('Saved', 'It stays on the job until the client signs or declines.'); }} /> : null}
        </Card>
      )}

      <Segmented<Lang> value={lang} onChange={setLang} options={[{ value: 'en', label: 'English PDF' }, { value: 'vi', label: 'PDF tiếng Việt' }]} />
      <Button kind="secondary" title={busy ? 'Creating PDF…' : locked ? 'Share signed change order' : 'Send for review (PDF)'} icon="share-outline"
        disabled={busy || (!locked && !title.trim())} onPress={share} />

      {!locked ? (
        <>
          <SendSignLink kind="change" estimateId={est.id} changeId={saved?.id ?? coId} title={`${est.title}: change order ${number}${title.trim() ? ` (${title.trim()})` : ''}`}
            clientName={est.clientName} total={Math.round((value(credit, amount) + taxOn(value(credit, amount), pct)) * 100) / 100}
            disabled={!title.trim() || !(amount > 0)}
            before={() => (saved ? saved.id : persist().id)}
            html={() => {
              const cur: ChangeOrder = { ...(saved ?? { id: coId, number, status: 'pending' as const, createdAt: new Date().toISOString() }), title: title.trim(), description, amount: value(credit, amount) } as ChangeOrder;
              const withCur = { ...contract, changeOrders: [...contract.changeOrders.filter((x) => x.id !== cur.id), cur] };
              return changeOrderHtml(est, profile, withCur, cur, 'en');
            }} />
          <Banner tone="info" title="Client approves on your phone">They type their name and sign below. The change is added to the contract and can be invoiced.</Banner>
          <Field label="Client name" value={name} onChangeText={setName} maxLength={80} />
          <SignaturePad width={padW} strokes={strokes} onChange={setStrokes} onDrawing={setDrawing} />
          <Button title="Client approves and signs" icon="checkmark-circle-outline" disabled={!title.trim() || !(amount > 0) || !name.trim() || !hasInk(strokes)} onPress={approve} />
          {saved ? (
            <Button kind="danger" title="Client declined"
              onPress={() => confirmAction('Mark as declined?', 'It stays on the list but is not added to the contract.', 'Declined', () => persist({ status: 'declined', decidedAt: new Date().toISOString() }))} />
          ) : null}
        </>
      ) : status === 'declined' ? (
        <Button kind="secondary" title="Reopen" onPress={() => persist({ status: 'pending', decidedAt: undefined })} />
      ) : null}

      {saved ? (
        <Button kind="danger" title="Delete change order"
          onPress={() => {
            if (invoiced) return notify('Already invoiced', 'This change order is on an invoice you sent, so it stays on the job. Add a credit change order to undo it.');
            confirmAction('Delete this change order?', status === 'approved' ? 'It is signed. Deleting removes it from the contract total.' : '', 'Delete', () => {
              updateContract(est.id, (c) => ({ ...c, changeOrders: c.changeOrders.filter((x) => x.id !== saved.id) }));
              router.back();
            });
          }} />
      ) : null}
    </Screen>
  );
}
