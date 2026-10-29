import { useState } from 'react';
import { View } from 'react-native';

import { CATEGORY_ORDER, JOB_TYPES, perUnit } from '@/engine/jobTypes';
import type { JobTypeId, PriceUnit } from '@/engine/types';

import { Button, Chip, Field, Label, Muted, Segmented } from './kit';

export const UNIT_OPTIONS: { value: PriceUnit; label: string }[] = [
  { value: 'SF', label: 'Per SF' },
  { value: 'LF', label: 'Per LF' },
  { value: 'EA', label: 'Each' },
  { value: 'JOB', label: 'Per job' },
];

/** Suffix for a price field: "/SF", "/LF", "each", "per job". */
export const priceSuffix = (unit: PriceUnit) => perUnit(unit).trim();

/** Every type of work, grouped (your own first), as tappable chips. */
export function JobTypeChips({ selected, onToggle, only }: {
  selected: JobTypeId[];
  onToggle: (id: JobTypeId) => void;
  /** Limit to these ids (e.g. the contractor's specialties). */
  only?: JobTypeId[];
}) {
  const types = JOB_TYPES.filter((j) => j.id !== 'small' && (!only || only.includes(j.id)));
  return (
    <View style={{ gap: 12 }}>
      {CATEGORY_ORDER.map((cat) => {
        const list = types.filter((j) => j.category === cat);
        if (list.length === 0) return null;
        return (
          <View key={cat} style={{ gap: 6 }}>
            <Label>{cat}</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {list.map((j) => <Chip key={j.id} label={j.name} selected={selected.includes(j.id)} onPress={() => onToggle(j.id)} />)}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** The blank field: type any work you do that isn't listed, and how you price it. */
export function AddOwnType({ onAdd, cta = 'Add' }: { onAdd: (name: string, unit: PriceUnit) => void; cta?: string }) {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<PriceUnit>('SF');
  const exists = JOB_TYPES.some((j) => j.name.trim().toLowerCase() === name.trim().toLowerCase());
  return (
    <View style={{ gap: 8 }}>
      <Field label="Type of work" value={name} onChangeText={setName} placeholder="e.g. Mold remediation, Garage doors, Pressure washing"
        maxLength={60} />
      <Label>How you price it</Label>
      <Segmented<PriceUnit> value={unit} onChange={setUnit} options={UNIT_OPTIONS} />
      {exists ? <Muted style={{ fontSize: 13 }}>That type is already in the list.</Muted> : null}
      <Button kind="secondary" title={cta} disabled={!name.trim() || exists}
        onPress={() => { onAdd(name.trim(), unit); setName(''); setUnit('SF'); }} />
    </View>
  );
}
