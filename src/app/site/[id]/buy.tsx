import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Share, View } from 'react-native';

import { buyListFromEstimate, buyTotals, emptyMoney, type BuyItem } from '@/engine/books';
import { money, money2, newId, qtyFmt } from '@/engine/format';
import { useApp } from '@/store/AppContext';
import { Button, C, Card, Field, H2, Muted, NumberField, Screen, Stat } from '@/ui/kit';
import { confirmAction } from '@/ui/notify';
import { Text } from '@/ui/text';

/** What to buy for the job: made from the estimate's materials, editable, ticked off as receipts come in. */
export default function BuyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { projects, estimates, updateMoney } = useApp();
  const [name, setName] = useState('');
  const [qty, setQty] = useState(1);
  const [unit, setUnit] = useState('');
  const [cost, setCost] = useState(0);
  const p = projects.find((x) => x.id === id);
  if (!p) return <Screen><Muted>This job site was deleted.</Muted></Screen>;
  const est = estimates.find((e) => e.id === p.estimateId);
  const items = (p.money ?? emptyMoney()).buy;
  const t = buyTotals(items);
  const set = (fn: (b: BuyItem[]) => BuyItem[]) => updateMoney(p.id, (m) => ({ ...m, buy: fn(m.buy) }));

  const fill = () => set((b) => [...b, ...buyListFromEstimate(est!, newId).filter((x) => !b.some((y) => y.name === x.name))]);
  const add = () => {
    set((b) => [...b, { id: newId(), name: name.trim(), qty: qty > 0 ? qty : 1, unit: unit.trim(), estCost: Math.max(0, cost), bought: false, source: 'added' }]);
    setName(''); setQty(1); setUnit(''); setCost(0);
  };
  // For the store or a worker picking up materials: quantities only, never prices.
  const share = () => Share.share({
    message: `${p.title}: materials to buy\n${items.filter((i) => !i.bought).map((i) => `☐ ${qtyFmt(i.qty)} ${i.unit} ${i.name}`).join('\n')}`,
  }).catch(() => {});

  return (
    <Screen>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Stat label="Bought" value={`${t.boughtCount} / ${t.count}`} tone="accent" />
        <Stat label="Planned" value={money(t.planned)} />
        <Stat label="Paid so far" value={money(t.spent)} />
      </View>

      {items.length === 0 ? (
        <Card>
          <H2>No buy list yet</H2>
          <Muted>{est ? 'Start from the estimate’s material list, then add or remove anything.' : 'Add the materials you need below.'}</Muted>
          {est ? <Button title="Make it from the estimate" icon="list-outline" onPress={fill} /> : null}
        </Card>
      ) : (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <H2 style={{ flex: 1 }}>To buy</H2>
            <Button kind="ghost" title="Share list" icon="share-outline" onPress={share} />
          </View>
          {items.map((i) => (
            <View key={i.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderColor: C.lineSoft }}>
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: i.bought }} accessibilityLabel={i.name} hitSlop={8}
                onPress={() => set((b) => b.map((x) => (x.id === i.id ? { ...x, bought: !x.bought } : x)))}>
                <Ionicons name={i.bought ? 'checkbox' : 'square-outline'} size={26} color={i.bought ? C.okInk : C.ink2} />
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text style={{ color: i.bought ? C.muted : C.ink, fontWeight: '600', textDecorationLine: i.bought ? 'line-through' : 'none' }}>{i.name}</Text>
                <Text style={{ color: C.muted, fontSize: 12 }}>
                  {qtyFmt(i.qty)} {i.unit} · planned {money2(i.estCost)}{i.spent ? ` · paid ${money2(i.spent)}` : ''}
                </Text>
              </View>
              {i.spent && i.estCost > 0 && i.spent > i.estCost * 1.05 ? <Text style={{ color: C.danger, fontSize: 12, fontWeight: '700' }}>+{Math.round(((i.spent - i.estCost) / i.estCost) * 100)}%</Text> : null}
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${i.name}`} hitSlop={8}
                onPress={() => confirmAction('Remove from the list?', i.name, 'Remove', () => set((b) => b.filter((x) => x.id !== i.id)))}>
                <Ionicons name="close-circle-outline" size={20} color={C.muted} />
              </Pressable>
            </View>
          ))}
        </Card>
      )}

      <Card>
        <H2>Add an item</H2>
        <Field label="Item" value={name} onChangeText={setName} maxLength={100} placeholder="e.g. Thinset, 50 lb bag" />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <NumberField label="Qty" value={qty} onChange={setQty} style={{ flex: 1 }} />
          <Field label="Unit" value={unit} onChangeText={setUnit} maxLength={12} style={{ flex: 1 }} placeholder="bag" />
          <NumberField label="Planned cost" suffix="$" value={cost} onChange={setCost} style={{ flex: 1.3 }} />
        </View>
        <Button kind="secondary" title="Add to list" icon="add" disabled={!name.trim()} onPress={add} />
      </Card>
      <Muted style={{ fontSize: 12 }}>Snap receipts from Job money: items that match this list are ticked off and the real price is remembered for your next estimate.</Muted>
    </Screen>
  );
}
