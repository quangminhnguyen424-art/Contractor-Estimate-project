import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { jobType, perUnit } from '@/engine/jobTypes';
import type { PriceUnit } from '@/engine/types';
import { useApp } from '@/store/AppContext';
import { UNIT_OPTIONS } from '@/ui/JobTypes';
import { Button, C, Card, Field, H2, Label, Muted, Screen, Segmented } from '@/ui/kit';
import { confirmAction } from '@/ui/notify';
import { describeQuestion, QuestionEditor } from '@/ui/QuestionEditor';

/** Settings for one type of work: your own questions, and for your own types, the name and price unit. */
export default function JobTypeScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { customTypes, customQuestions, saveCustomType, deleteCustomType, saveQuestions, presets, pastJobs } = useApp();
  const own = customTypes.find((t) => t.id === id);
  const jt = jobType(id);
  const qs = customQuestions[id] ?? [];
  const [name, setName] = useState(own?.name ?? '');
  const [unit, setUnit] = useState<PriceUnit>(own?.unit ?? 'SF');

  const remove = () =>
    confirmAction(`Delete “${jt.name}”?`, 'Its prices, questions and past jobs are removed. Estimates you already made stay.', 'Delete', () => {
      deleteCustomType(id);
      router.back();
    });

  return (
    <Screen>
      <Stack.Screen options={{ title: jt.name }} />
      <Muted>Priced{perUnit(jt.unit)}. {own ? 'Your own type of work.' : 'Built-in type of work.'}</Muted>

      {own ? (
        <Card>
          <H2>Name and pricing</H2>
          <Field label="Type of work" value={name} onChangeText={setName} maxLength={60} />
          <Label>How you price it</Label>
          <Segmented<PriceUnit> value={unit} onChange={setUnit} options={UNIT_OPTIONS} />
          <Button kind="secondary" title="Save" disabled={!name.trim() || (name.trim() === own.name && unit === own.unit)}
            onPress={() => {
              const next = { ...own, name: name.trim(), unit };
              const hasData = !!presets[id] || pastJobs.some((j) => j.jobTypeId === id);
              if (unit === own.unit || !hasData) return saveCustomType(next, { resetPricing: unit !== own.unit });
              confirmAction('Change how you price it?', 'Your prices and past jobs for this type were in the old unit, so they are cleared. Estimates you already made stay.',
                'Change', () => saveCustomType(next, { resetPricing: true }));
            }} />
        </Card>
      ) : null}

      <Card>
        <H2>Your questions</H2>
        <Muted style={{ fontSize: 13 }}>
          Asked on every {jt.name.toLowerCase()} job, after the standard questions. Claude reads them too and fills them in from your notes.
          Give a question a price and it’s added to the quote as its own line.
        </Muted>
        {qs.length === 0 ? <Muted style={{ fontSize: 13 }}>No questions yet.</Muted> : null}
        {qs.map((q) => (
          <View key={q.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderColor: C.lineSoft, paddingTop: 8 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: C.ink, fontWeight: '600' }}>{q.label}</Text>
              <Muted style={{ fontSize: 13 }}>{describeQuestion(q)}</Muted>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${q.label}`} onPress={() => saveQuestions(id, qs.filter((x) => x.id !== q.id))}
              style={{ padding: 8 }}>
              <Text style={{ color: '#B42318', fontWeight: '600' }}>Remove</Text>
            </Pressable>
          </View>
        ))}
      </Card>

      <Card>
        <H2>Add a question</H2>
        <QuestionEditor onAdd={(q) => saveQuestions(id, [...qs, q])} />
      </Card>

      {own ? (
        <Pressable accessibilityRole="button" onPress={remove} style={{ alignSelf: 'center', padding: 12 }}>
          <Text style={{ color: '#B42318', fontWeight: '600' }}>Delete this type of work</Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}
