import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, View } from 'react-native';

import {
  applyReceiptToBuy, COST_KINDS, emptyMoney, KIND_ORDER, lessonsFromReceipt, matchReceipt, parseReceipt, receiptPrompt,
  type CostEntry, type CostKind, type ReceiptLine,
} from '@/engine/books';
import { money2, newId } from '@/engine/format';
import { isYmd } from '@/engine/schedule';
import { useApp } from '@/store/AppContext';
import { aiFor } from '@/ui/host';
import { Banner, Button, C, Card, Chip, Field, H2, Muted, NumberField, Screen } from '@/ui/kit';
import { savePhoto, usePhotoUri } from '@/ui/photoStore';
import { toAiImage } from '@/ui/photos';
import { Text } from '@/ui/text';
import { Tick } from '@/ui/tick';
import { useToday } from '@/ui/useToday';

/** Add or edit one cost. With ?receipt=1 it starts by photographing a receipt that Bidwell reads. */
export default function CostScreen() {
  const { id, cost: costId, receipt } = useLocalSearchParams<{ id: string; cost?: string; receipt?: string }>();
  const { projects, updateMoney, addLessons, apiKey, aiAllowed, deletePhotosLater } = useApp();
  const today = useToday();
  const p = projects.find((x) => x.id === id);
  const m = p?.money ?? emptyMoney();
  const editing = m.costs.find((c) => c.id === costId);

  const [kind, setKind] = useState<CostKind>(editing?.kind ?? (receipt ? 'materials' : 'labor'));
  const [vendor, setVendor] = useState(editing?.vendor ?? '');
  const [note, setNote] = useState(editing?.note ?? '');
  const [date, setDate] = useState(editing?.date ?? today);
  const [amount, setAmount] = useState(editing?.amount ?? 0);
  const [lines, setLines] = useState<ReceiptLine[]>(editing?.lines ?? []);
  const [receiptUri, setReceiptUri] = useState(editing?.receiptUri);
  const [ownerOwes, setOwnerOwes] = useState(!!editing?.ownerOwes);
  const [due, setDue] = useState(editing?.ownerOwes?.due ?? today);
  const [reading, setReading] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'warn' | 'info' | 'ok'; text: string } | null>(null);
  const shown = usePhotoUri(receiptUri ?? '');

  if (!p) return <Screen><Muted>This job site was deleted.</Muted></Screen>;

  const snap = async (camera: boolean) => {
    setMsg(null);
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : { granted: true };
    if (!perm.granted) { setMsg({ tone: 'warn', text: 'Allow the camera in your phone settings to snap receipts.' }); return; }
    const r = camera
      ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (r.canceled || !r.assets[0]) return;
    const saved = await savePhoto(r.assets[0].uri, r.assets[0].width).catch(() => null);
    if (!saved) { setMsg({ tone: 'warn', text: 'Could not save the photo. Try again.' }); return; }
    // A second retake before saving: the in-between photo is never kept.
    if (receiptUri && receiptUri !== editing?.receiptUri) deletePhotosLater([receiptUri]);
    setReceiptUri(saved.uri);
    if (!aiAllowed) { setMsg({ tone: 'info', text: 'Photo saved. Turn on AI sharing in Settings to have Bidwell read receipts; for now, type the amount.' }); return; }
    setReading(true);
    try {
      const img = await toAiImage(r.assets[0].uri);
      if (!img) throw new Error('Could not open the photo. Type the amount instead.');
      const reply = await aiFor(apiKey, aiAllowed).complete(receiptPrompt(m.buy.map((b) => b.name)), [{ ...img, label: 'Receipt' }], 1500);
      const read = parseReceipt(reply);
      const matched = matchReceipt(read.lines, m.buy);
      setVendor(read.vendor || vendor);
      if (read.date) setDate(read.date);
      setAmount(read.total);
      setKind(read.kind);
      setLines(matched);
      const n = matched.filter((l) => l.buyId).length;
      setMsg({ tone: 'ok', text: `Read ${read.lines.length} line${read.lines.length === 1 ? '' : 's'}, total ${money2(read.total)}${n ? `; ${n} matched your buy list` : ''}. Check it, then save.` });
    } catch (e) {
      setMsg({ tone: 'warn', text: e instanceof Error ? e.message : 'Bidwell could not read this receipt. Type the amount instead.' });
    } finally {
      setReading(false);
    }
  };

  const valid = amount > 0 && amount < 1e7 && isYmd(date) && (!ownerOwes || isYmd(due));

  const save = () => {
    const entry: CostEntry = {
      id: editing?.id ?? newId(), date, kind, vendor: vendor.trim(), note: note.trim(), amount: Math.round(amount * 100) / 100,
      ...(receiptUri ? { receiptUri } : {}), ...(lines.length ? { lines } : {}),
      ...(ownerOwes ? { ownerOwes: { due, ...(editing?.ownerOwes?.paidOn ? { paidOn: editing.ownerOwes.paidOn } : {}) } } : {}),
      ...(editing?.memberId ? { memberId: editing.memberId } : {}), ...(editing?.eventId ? { eventId: editing.eventId } : {}),
      createdAt: editing?.createdAt ?? new Date().toISOString(),
    };
    // A new receipt marks what it paid for on the buy list, and teaches the real price for next time.
    const fresh = !editing && lines.some((l) => l.buyId);
    if (fresh) addLessons(lessonsFromReceipt(lines, m.buy, { at: date, vendor: entry.vendor, projectId: p.id, costId: entry.id }, newId));
    // A retaken photo replaces the old one: delete the file nobody points to any more.
    if (editing?.receiptUri && editing.receiptUri !== receiptUri) deletePhotosLater([editing.receiptUri]);
    updateMoney(p.id, (x) => ({
      ...x,
      costs: editing ? x.costs.map((c) => (c.id === entry.id ? entry : c)) : [...x.costs, entry],
      buy: fresh ? applyReceiptToBuy(x.buy, lines) : x.buy,
    }));
    router.back();
  };

  return (
    <Screen footer={<Button title={editing ? 'Save changes' : 'Save cost'} icon="checkmark" disabled={!valid || reading} onPress={save} />}>
      <Card>
        <H2>Receipt</H2>
        {receiptUri ? <Image source={{ uri: shown }} style={{ width: '100%', height: 220, borderRadius: 6, backgroundColor: C.cardHi }} resizeMode="contain" accessibilityLabel="Receipt photo" /> : null}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button title={reading ? 'Reading…' : receiptUri ? 'Retake' : 'Snap receipt'} icon="camera-outline" disabled={reading} style={{ flex: 1 }} onPress={() => snap(true)} />
          <Button kind="secondary" title="From photos" icon="image-outline" disabled={reading} style={{ flex: 1 }} onPress={() => snap(false)} />
        </View>
        {msg ? <Banner tone={msg.tone} title={msg.text} /> : <Muted style={{ fontSize: 13 }}>Bidwell reads the store, date, items and total, and checks them against your buy list.</Muted>}
      </Card>

      <Card>
        <H2>Cost</H2>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {KIND_ORDER.map((k) => <Chip key={k} label={COST_KINDS[k].en} selected={kind === k} onPress={() => setKind(k)} />)}
        </View>
        <NumberField label="Amount paid (tax included)" suffix="$" value={amount} onChange={setAmount} />
        <Field label={kind === 'labor' ? 'Who' : kind === 'subs' ? 'Subcontractor' : 'Store or vendor'} value={vendor} onChangeText={setVendor} maxLength={60} />
        <Field label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} maxLength={10} autoCapitalize="none" />
        <Field label="Note" value={note} onChangeText={setNote} maxLength={500} placeholder="What it was for" />
        <Tick on={ownerOwes} required onPress={() => setOwnerOwes(!ownerOwes)}>
          <Text style={{ color: C.ink, fontSize: 15 }}>I paid this for the owner; they pay me back</Text>
        </Tick>
        {ownerOwes ? <Field label="Owner pays back by (YYYY-MM-DD)" value={due} onChangeText={setDue} maxLength={10} autoCapitalize="none" /> : null}
      </Card>

      {lines.length ? (
        <Card>
          <H2>Items on the receipt</H2>
          {lines.map((l, i) => {
            const b = m.buy.find((x) => x.id === l.buyId);
            return (
              <View key={`${l.name}-${i}`} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 6, borderTopWidth: 1, borderColor: C.lineSoft }}>
                <Ionicons name={b ? 'link' : 'remove'} size={16} color={b ? C.okInk : C.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.ink }}>{l.qty} {l.unit} {l.name}</Text>
                  {b ? <Text style={{ color: C.muted, fontSize: 12 }}>Buy list: {b.name} (planned {money2(b.estCost)})</Text> : null}
                </View>
                <Text style={{ color: C.ink, fontWeight: '600' }}>{money2(l.total)}</Text>
              </View>
            );
          })}
          <Muted style={{ fontSize: 12 }}>AI can misread receipts. Check the total before saving.</Muted>
        </Card>
      ) : null}
    </Screen>
  );
}
