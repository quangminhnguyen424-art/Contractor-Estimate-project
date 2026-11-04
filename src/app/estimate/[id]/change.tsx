import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { changeOrderHtml, hasInk, signatureSvg, taxOn, type ChangeOrder } from '@/engine/contract';
import { dateFmt, money } from '@/engine/format';
import type { Lang } from '@/engine/types';
import { useApp } from '@/store/AppContext';
import { Badge, Banner, Button, C, Card, Field, H2, Muted, NumberField, P, Screen, Segmented } from '@/ui/kit';
import { confirmAction, notify } from '@/ui/notify';
import { sharePdf } from '@/ui/share';
import { SignaturePad } from '@/ui/SignaturePad';
import { Text } from '@/ui/text';

/** One change order: what changes and the price, then the client signs to approve it. */
export default function ChangeOrderScreen() {
  const { id, co: coId } = useLocalSearchParams<{ id: string; co: string }>();
  const { estimates, profile, contracts, updateContract } = useApp();
  const { width } = useWindowDimensions();
  const est = estimates.find((e) => e.id === id);
  const contract = contracts.find((c) => c.estimateId === id);
  const co = contract?.changeOrders.find((x) => x.id === coId);
  const [title, setTitle] = useState(co?.title ?? '');
  const [description, setDescription] = useState(co?.description ?? '');
  const [credit, setCredit] = useState((co?.amount ?? 0) < 0);
  const [amount, setAmount] = useState(Math.abs(co?.amount ?? 0));
  const [name, setName] = useState(est?.clientName ?? '');
  const [strokes, setStrokes] = useState<number[][]>([]);
  const [drawing, setDrawing] = useState(false);
  const [lang, setLang] = useState<Lang>(profile?.quoteLanguage ?? 'en');
  const [busy, setBusy] = useState(false);
  if (!est || !profile || !contract || !co) return <Screen><Muted>This change order was deleted.</Muted></Screen>;
  const padW = Math.min(width, 760) - 32;
  const locked = co.status !== 'pending';
  const value = Math.round((credit ? -amount : amount) * 100) / 100;

  const setCo = (patch: Partial<ChangeOrder>) =>
    updateContract(est.id, (c) => ({ ...c, changeOrders: c.changeOrders.map((x) => (x.id === co.id ? { ...x, ...patch } : x)) }));
  const saveFields = () => setCo({ title: title.trim(), description, amount: value });

  const approve = () => {
    if (!title.trim()) return notify('Add a short title', 'For example "Add recessed lights in hallway".');
    if (!name.trim() || !hasInk(strokes)) return notify('Client signature needed', 'The client types their name and signs in the white box.');
    setCo({ title: title.trim(), description, amount: value, status: 'approved', decidedAt: new Date().toISOString(),
      signature: { name: name.trim(), strokes, w: padW, h: 170, signedAt: new Date().toISOString() } });
    notify(`Change order #${co.number} approved`, `${money(value)} + tax is added to the contract and can be invoiced.`);
  };

  const share = async () => {
    saveFields();
    setBusy(true);
    try {
      const cur = { ...co, title: title.trim() || co.title, description, amount: locked ? co.amount : value };
      await sharePdf(changeOrderHtml(est, profile, contract, cur, lang), `Change order ${co.number} — ${est.title}`);
    } catch {
      notify('Could not create the PDF', 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scrollEnabled={!drawing}>
      <Stack.Screen options={{ title: `Change order #${co.number}` }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ color: C.ink, fontSize: 20, fontWeight: '800', flex: 1 }}>{est.title}</Text>
        <Badge label={co.status === 'approved' ? 'Signed' : co.status === 'declined' ? 'Declined' : 'Waiting for client'} tone={co.status === 'approved' ? 'ok' : co.status === 'declined' ? 'bad' : 'warn'} />
      </View>

      {locked ? (
        <Card>
          <H2>{co.title}</H2>
          {co.description ? <Text style={{ color: C.ink2, lineHeight: 21 }}>{co.description}</Text> : null}
          <Text style={{ color: C.accent, fontSize: 24, fontWeight: '800', fontFamily: '__numbers__' }}>{money(co.amount)} <Text style={{ color: C.muted, fontSize: 14 }}>+ {money(taxOn(co.amount, est.salesTaxPct))} tax</Text></Text>
          {co.signature ? (
            <View style={{ backgroundColor: P.paper, borderRadius: 12, padding: 10, gap: 4 }}>
              <SvgXml xml={signatureSvg(co.signature, '#0F172A')} width={padW - 52} height={Math.round(((padW - 52) * co.signature.h) / co.signature.w)} />
              <Text style={{ color: P.muted, fontSize: 12 }}>{co.signature.name} · {dateFmt(co.signature.signedAt)}</Text>
            </View>
          ) : null}
        </Card>
      ) : (
        <Card>
          <Field label="What changes" value={title} onChangeText={setTitle} onBlur={saveFields} maxLength={120} placeholder="e.g. Add 4 recessed lights in hallway" />
          <Field label="Details (shown to the client)" multiline value={description} onChangeText={setDescription} onBlur={saveFields}
            placeholder="Materials, where, anything that changes in the schedule." />
          <Segmented<'add' | 'credit'> value={credit ? 'credit' : 'add'} onChange={(v) => setCredit(v === 'credit')}
            options={[{ value: 'add', label: 'Adds to price' }, { value: 'credit', label: 'Credit (work removed)' }]} />
          <NumberField label="Price before tax" suffix="$" value={amount} onChange={setAmount} />
          <Muted style={{ fontSize: 13 }}>{money(value)} + {est.salesTaxPct}% tax {money(taxOn(value, est.salesTaxPct))} = {money(value + taxOn(value, est.salesTaxPct))}</Muted>
        </Card>
      )}

      <Segmented<Lang> value={lang} onChange={setLang} options={[{ value: 'en', label: 'English PDF' }, { value: 'vi', label: 'PDF tiếng Việt' }]} />
      <Button kind="secondary" title={busy ? 'Creating PDF…' : locked ? 'Share signed change order' : 'Send for review (PDF)'} icon="share-outline" disabled={busy} onPress={share} />

      {!locked ? (
        <>
          <Banner tone="info" title="Client approves on your phone">They type their name and sign below. The change is added to the contract and can be invoiced.</Banner>
          <Field label="Client name" value={name} onChangeText={setName} maxLength={80} />
          <SignaturePad width={padW} strokes={strokes} onChange={setStrokes} onDrawing={setDrawing} />
          <Button title="Client approves and signs" icon="checkmark-circle-outline" disabled={!title.trim() || !name.trim() || !hasInk(strokes)} onPress={approve} />
          <Button kind="danger" title="Client declined"
            onPress={() => confirmAction('Mark as declined?', 'It stays on the list but is not added to the contract.', 'Declined', () => { saveFields(); setCo({ status: 'declined', decidedAt: new Date().toISOString() }); })} />
        </>
      ) : co.status === 'declined' ? (
        <Button kind="secondary" title="Reopen" onPress={() => setCo({ status: 'pending', decidedAt: undefined })} />
      ) : null}

      <Button kind="danger" title="Delete change order"
        onPress={() => confirmAction('Delete this change order?', co.status === 'approved' ? 'It is signed. Deleting removes it from the contract total.' : '', 'Delete', () => {
          updateContract(est.id, (c) => ({ ...c, changeOrders: c.changeOrders.filter((x) => x.id !== co.id), invoices: c.invoices.filter((v) => v.itemKey !== `co:${co.id}`) }));
          router.back();
        })} />
    </Screen>
  );
}
