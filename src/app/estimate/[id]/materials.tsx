import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Text } from '@/ui/text';
import { money, money2 } from '@/engine/format';
import { materialsHtml } from '@/engine/quote';
import type { MaterialLine } from '@/engine/types';
import { useApp } from '@/store/AppContext';
import { Button, C, Card, H2, Muted, Screen, mono } from '@/ui/kit';
import { notify } from '@/ui/notify';
import { sharePdf } from '@/ui/share';

export default function MaterialsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { estimates, profile } = useApp();
  const [busy, setBusy] = useState(false);
  const est = estimates.find((e) => e.id === id);
  if (!est || !profile) return <Screen><Muted>Estimate not found.</Muted></Screen>;

  const groups = new Map<string, MaterialLine[]>();
  for (const m of est.materials) groups.set(m.category, [...(groups.get(m.category) ?? []), m]);

  const share = async (prices: boolean) => {
    setBusy(true);
    try {
      await sharePdf(materialsHtml(est, profile, prices), `Materials — ${est.title}`);
    } catch {
      notify('Could not create the PDF', 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen footer={(
      <View style={{ gap: 8 }}>
        {/* The copy for the crew or the store never shows what the materials cost you. */}
        <Button title={busy ? 'Creating PDF…' : 'Share list for crew or store'} icon="share-outline" disabled={busy} onPress={() => share(false)} />
        <Button kind="ghost" title="Share with my prices" disabled={busy} onPress={() => share(true)} />
      </View>
    )}>
      <View style={{ gap: 4 }}>
        <H2 raw>{est.title}</H2>
        <Muted>{est.materials.length} items · {money(est.materialTotal)} before tax. Quantities are rounded up to whole boxes, sheets and rolls.</Muted>
      </View>
      {[...groups.entries()].map(([cat, rows]) => (
        <Card key={cat} style={{ gap: 0 }}>
          <Text style={{ fontWeight: '700', color: C.ink, marginBottom: 6 }}>{cat}</Text>
          {rows.map((m) => (
            <View key={m.materialId} style={{ flexDirection: 'row', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderColor: C.lineSoft }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.ink, fontSize: 14 }}>{m.name}</Text>
                <Text style={{ color: C.muted, fontSize: 12 }}>{m.qty} {m.unit} × {money2(m.unitPrice)}</Text>
              </View>
              <Text style={{ fontFamily: mono, color: C.ink }}>{money2(m.total)}</Text>
            </View>
          ))}
        </Card>
      ))}
      <Muted style={{ fontSize: 13 }}>Prices come from your price book. Change them in Pricing → Price book.</Muted>
    </Screen>
  );
}
