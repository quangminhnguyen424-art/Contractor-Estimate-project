import { Redirect, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { ASSEMBLIES, TRADE_NAMES } from '@/engine/catalog';
import { laborRate } from '@/engine/estimator';
import { money2 } from '@/engine/format';
import { FINISH_LABELS, JOB_TYPE_BY_ID } from '@/engine/jobTypes';
import type { AnswerValue, FinishLevel, Question } from '@/engine/types';
import { useApp } from '@/store/AppContext';
import { Button, C, Card, Chip, Field, H2, Label, Muted, NumberField, Screen, Segmented } from '@/ui/kit';

export default function Questions() {
  const { draft, setDraft, commitDraft, priceBook } = useApp();
  const [search, setSearch] = useState('');

  const jt = draft ? JOB_TYPE_BY_ID[draft.jobTypeId] : null;
  const quick = draft?.jobTypeId !== 'small' && (draft?.mode === 'quick' || (jt ? !jt.detailed : false));

  const groups = useMemo(() => {
    if (!jt) return [];
    const qs = quick ? jt.questions.filter((q) => q.id === 'sizeSf' || q.id === 'yearBuilt') : jt.questions;
    const map = new Map<string, Question[]>();
    for (const q of qs) map.set(q.group ?? 'Details', [...(map.get(q.group ?? 'Details') ?? []), q]);
    return [...map.entries()];
  }, [jt, quick]);

  if (!draft || !jt) return <Redirect href="/new" />;

  const set = (id: string, v: AnswerValue) => setDraft({ ...draft, answers: { ...draft.answers, [id]: v } });
  const setQty = (assemblyId: string, qty: number) => {
    const rest = draft.customItems.filter((i) => i.assemblyId !== assemblyId);
    setDraft({ ...draft, customItems: qty > 0 ? [...rest, { assemblyId, qty }] : rest });
  };
  const qtyOf = (assemblyId: string) => draft.customItems.find((i) => i.assemblyId === assemblyId)?.qty ?? 0;
  const isSmall = draft.jobTypeId === 'small';
  const q = search.trim().toLowerCase();
  const pickable = ASSEMBLIES.filter((a) => !q || a.name.toLowerCase().includes(q) || TRADE_NAMES[a.trade].en.toLowerCase().includes(q));

  const build = () => {
    const editing = !!draft.id;
    const id = commitDraft(draft);
    setDraft(null);
    // Editing: the estimate screen is already underneath, so just go back to it.
    if (editing && router.canGoBack()) router.back();
    else router.replace(`/estimate/${id}`);
  };

  return (
    <Screen footer={<Button title={draft.id ? 'Update estimate' : 'Build estimate'} onPress={build}
      disabled={isSmall && draft.customItems.length === 0} />}>
      <View style={{ gap: 4 }}>
        <H2>{draft.title}</H2>
        <Muted>{jt.name} · {quick ? 'Quick ($/SF)' : 'Detailed'}</Muted>
      </View>

      {draft.aiNotes && draft.aiNotes.length > 0 ? (
        <Card style={{ backgroundColor: C.infoBg, borderColor: C.infoBg }}>
          <Text style={{ fontWeight: '700', color: C.infoInk }}>Claude noticed</Text>
          {draft.aiNotes.map((n, i) => <Text key={i} style={{ color: C.infoInk, lineHeight: 20 }}>• {n}</Text>)}
        </Card>
      ) : null}

      {draft.heard.length > 0 ? (
        <Card style={{ backgroundColor: C.okBg, borderColor: C.okBg }}>
          <Text style={{ fontWeight: '700', color: C.okInk }}>Filled in for you</Text>
          <Text style={{ color: C.okInk, lineHeight: 20 }}>{draft.heard.join(' · ')}</Text>
        </Card>
      ) : (
        <Muted>Answer what you know. Anything you skip uses a standard assumption, and it’s flagged on the estimate.</Muted>
      )}

      <Label>Finish level</Label>
      <Segmented<FinishLevel>
        value={draft.finish}
        onChange={(f) => setDraft({ ...draft, finish: f })}
        options={(['basic', 'mid', 'high'] as FinishLevel[]).map((f) => ({ value: f, label: FINISH_LABELS[f].en }))}
      />

      {groups.map(([group, qs]) => (
        <Card key={group}>
          <H2>{group}</H2>
          {qs.map((qq) => <QuestionInput key={qq.id} q={qq} value={draft.answers[qq.id]} onChange={(v) => set(qq.id, v)} />)}
        </Card>
      ))}

      {isSmall || !quick ? (
        <Card>
          <H2>{isSmall ? 'Add work items' : 'Add extra items'}</H2>
          <Muted>{isSmall ? 'Pick the work from your price book.' : 'Anything not covered by the questions above.'}</Muted>
          <Field label="Search items" value={search} onChangeText={setSearch} placeholder="e.g. outlet, door, tile" />
          {(q || isSmall ? pickable.slice(0, 25) : draft.customItems.map((i) => ASSEMBLIES.find((a) => a.id === i.assemblyId)!))
            .filter(Boolean)
            .map((a) => (
              <View key={a.id} style={{ gap: 2, paddingVertical: 4, borderTopWidth: 1, borderColor: C.lineSoft }}>
                <NumberField label={a.name} suffix={a.unit} value={qtyOf(a.id)} onChange={(n) => setQty(a.id, n)} />
                <Muted style={{ fontSize: 12 }}>{TRADE_NAMES[a.trade].en}{a.labor > 0 ? ` · labor ${money2(laborRate(a.id, priceBook))}/${a.unit}` : ' · materials only'}</Muted>
              </View>
            ))}
          {!isSmall && !q && draft.customItems.length === 0 ? <Muted style={{ fontSize: 13 }}>Search to add items.</Muted> : null}
        </Card>
      ) : null}

      <Card>
        <H2>Scope summary for the client</H2>
        <Muted>Optional. Shown on the quote in your words. Your job notes stay private.</Muted>
        <Field label="Scope summary" multiline value={draft.scopeNote} onChangeText={(v) => setDraft({ ...draft, scopeNote: v })}
          placeholder="e.g. Convert basement into 4 bedrooms with 2 new bathrooms, laundry and kitchenette." />
      </Card>
    </Screen>
  );
}

function QuestionInput({ q, value, onChange }: { q: Question; value: AnswerValue | undefined; onChange: (v: AnswerValue) => void }) {
  if (q.kind === 'number') {
    const n = typeof value === 'number' ? value : Number(value ?? q.default);
    return <NumberField label={q.label} suffix={q.unit} help={q.help} value={Number.isFinite(n) ? n : Number(q.default)} onChange={onChange} />;
  }
  if (q.kind === 'yesno') {
    const on = value === true || value === 'yes';
    return (
      <View style={{ gap: 6 }}>
        <Label>{q.label}</Label>
        <Segmented<'yes' | 'no'> value={on ? 'yes' : 'no'} onChange={(v) => onChange(v === 'yes')}
          options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
        {q.help ? <Muted style={{ fontSize: 13 }}>{q.help}</Muted> : null}
      </View>
    );
  }
  return (
    <View style={{ gap: 6 }}>
      <Label>{q.label}</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {q.options!.map((o) => <Chip key={o.value} label={o.label} selected={value === o.value} onPress={() => onChange(o.value)} />)}
      </View>
      {q.help ? <Muted style={{ fontSize: 13 }}>{q.help}</Muted> : null}
    </View>
  );
}
