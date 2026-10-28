import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ASSEMBLIES, MATERIALS, TRADE_NAMES, TRADE_ORDER } from '@/engine/catalog';
import { useApp } from '@/store/AppContext';
import { C, Card, Field, Muted, NumberField, Screen, Segmented } from '@/ui/kit';

export default function PriceBook() {
  const { priceBook, savePriceBook } = useApp();
  const [tab, setTab] = useState<'labor' | 'materials'>('labor');
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();

  const labor = useMemo(
    () => TRADE_ORDER.map((t) => ({ t, items: ASSEMBLIES.filter((a) => a.trade === t && a.labor > 0 && (!query || a.name.toLowerCase().includes(query))) }))
      .filter((g) => g.items.length > 0),
    [query],
  );
  const mats = useMemo(() => {
    const map = new Map<string, typeof MATERIALS>();
    for (const m of MATERIALS) if (!query || m.name.toLowerCase().includes(query)) map.set(m.category, [...(map.get(m.category) ?? []), m]);
    return [...map.entries()];
  }, [query]);

  const setLabor = (id: string, v: number) => savePriceBook({ ...priceBook, labor: { ...priceBook.labor, [id]: v } });
  const setMat = (id: string, v: number) => savePriceBook({ ...priceBook, materials: { ...priceBook.materials, [id]: v } });
  const resetLabor = (id: string) => { const { [id]: _, ...rest } = priceBook.labor; savePriceBook({ ...priceBook, labor: rest }); };
  const resetMat = (id: string) => { const { [id]: _, ...rest } = priceBook.materials; savePriceBook({ ...priceBook, materials: rest }); };

  return (
    <Screen>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'labor', label: 'Labor rates' }, { value: 'materials', label: 'Material prices' }]} />
      <Field label="Search" value={q} onChangeText={setQ} placeholder={tab === 'labor' ? 'e.g. shower, outlet' : 'e.g. drywall, PEX'} />
      <Muted style={{ fontSize: 13 }}>
        {tab === 'labor'
          ? 'Your labor cost per unit (what it costs you, before markup). Changes apply to new and rebuilt estimates.'
          : 'Default prices are typical Seattle-area retail. Put in your pro pricing. Tile, fixtures, cabinets and doors adjust automatically for basic and high-end finishes.'}
      </Muted>

      {tab === 'labor'
        ? labor.map((g) => (
            <Card key={g.t}>
              <Text style={{ fontWeight: '700', color: C.ink }}>{TRADE_NAMES[g.t].en}</Text>
              {g.items.map((a) => (
                <PriceRow key={a.id} label={a.name} unit={a.unit} value={priceBook.labor[a.id] ?? a.labor} changed={a.id in priceBook.labor}
                  onChange={(v) => setLabor(a.id, v)} onReset={() => resetLabor(a.id)} />
              ))}
            </Card>
          ))
        : mats.map(([cat, items]) => (
            <Card key={cat}>
              <Text style={{ fontWeight: '700', color: C.ink }}>{cat}</Text>
              {items.map((m) => (
                <PriceRow key={m.id} label={m.name} unit={m.unit} value={priceBook.materials[m.id] ?? m.price} changed={m.id in priceBook.materials}
                  onChange={(v) => setMat(m.id, v)} onReset={() => resetMat(m.id)} />
              ))}
            </Card>
          ))}
    </Screen>
  );
}

function PriceRow({ label, unit, value, changed, onChange, onReset }: {
  label: string; unit: string; value: number; changed: boolean; onChange: (v: number) => void; onReset: () => void;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, borderTopWidth: 1, borderColor: C.lineSoft, paddingTop: 8 }}>
      <NumberField label={label} suffix={`$ / ${unit}`} value={value} onChange={onChange} style={{ flex: 1 }} />
      {changed ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Reset ${label}`} onPress={onReset} style={{ height: 48, justifyContent: 'center' }}>
          <Text style={{ color: C.accent, fontWeight: '600' }}>Reset</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
