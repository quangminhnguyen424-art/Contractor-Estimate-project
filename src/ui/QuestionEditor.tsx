import { useState } from 'react';
import { View } from 'react-native';

import { newId } from '@/engine/format';
import type { Question } from '@/engine/types';
import { sanitizeQuestion } from '@/store/sanitize';

import { Button, Field, Label, Muted, NumberField, Segmented } from './kit';

type Kind = 'number' | 'yesno' | 'text' | 'choice';
const KINDS: { value: Kind; label: string }[] = [
  { value: 'number', label: 'Number' },
  { value: 'yesno', label: 'Yes / no' },
  { value: 'choice', label: 'Choices' },
  { value: 'text', label: 'Text' },
];

/** The blank space for the contractor's own question: what to ask, what kind of answer, and (optional) what it adds to the price. */
export function QuestionEditor({ onAdd }: { onAdd: (q: Question) => void }) {
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<Kind>('number');
  const [unit, setUnit] = useState('');
  const [price, setPrice] = useState(0);
  const [choices, setChoices] = useState('');

  const options = choices.split(',').map((c) => c.trim()).filter(Boolean).slice(0, 12)
    .map((c, i) => ({ value: `o${i + 1}`, label: c.slice(0, 40) }));
  const ok = label.trim().length > 0 && (kind !== 'choice' || options.length >= 2);

  const add = () => {
    const q = sanitizeQuestion({ id: `cq_${newId()}`, label, kind, unit, price, options });
    if (!q) return;
    onAdd(q);
    setLabel(''); setUnit(''); setPrice(0); setChoices('');
  };

  return (
    <View style={{ gap: 8 }}>
      <Field label="Question" value={label} onChangeText={setLabel} maxLength={120}
        placeholder={kind === 'yesno' ? 'e.g. Haul-away and dump fees?' : kind === 'number' ? 'e.g. Extra outlets' : kind === 'choice' ? 'e.g. Shingle type' : 'e.g. Gate code / access notes'} />
      <Label>Answer type</Label>
      <Segmented<Kind> value={kind} onChange={setKind} options={KINDS} />
      {kind === 'number' ? (
        <Field label="Unit (optional)" value={unit} onChangeText={setUnit} maxLength={12} placeholder="e.g. EA, SF, LF, hours" autoCapitalize="none" />
      ) : null}
      {kind === 'choice' ? (
        <Field label="Choices, separated by commas" value={choices} onChangeText={setChoices}
          placeholder="e.g. 3-tab, Architectural, Metal" help={options.length < 2 ? 'Add at least 2 choices.' : `${options.length} choices`} />
      ) : null}
      {kind === 'number' || kind === 'yesno' ? (
        <NumberField label={kind === 'number' ? `You charge per ${unit.trim() || 'unit'} (optional)` : 'You charge if yes (optional)'}
          value={price} onChange={setPrice} suffix="$"
          help="Your client price before tax. Leave 0 if it only informs the estimate; Claude and you still see the answer." />
      ) : (
        <Muted style={{ fontSize: 13 }}>Claude fills this in from your notes when it can, and it’s saved with the estimate.</Muted>
      )}
      <Button kind="secondary" title="Add question" disabled={!ok} onPress={add} />
    </View>
  );
}

/** One line describing a saved question: "Number · $185 per EA". */
export function describeQuestion(q: Question): string {
  const kind = q.kind === 'number' ? `Number${q.unit ? ` (${q.unit})` : ''}` : q.kind === 'yesno' ? 'Yes / no'
    : q.kind === 'choice' ? `Choices: ${q.options?.map((o) => o.label).join(', ')}` : 'Text';
  const price = q.price ? (q.kind === 'number' ? ` · $${q.price} per ${q.unit || 'unit'}` : ` · $${q.price} if yes`) : '';
  return kind + price;
}
