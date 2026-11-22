import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { ASSEMBLIES, ASSEMBLY_BY_ID, TRADE_NAMES } from '@/engine/catalog';
import { buildEstimate, hourlyRate, laborRate, pricedWork } from '@/engine/estimator';
import { money, qtyFmt, rate } from '@/engine/format';
import { FINISH_LABELS, jobType, qtyWithUnit } from '@/engine/jobTypes';
import type { AnswerValue, FinishLevel, Question, WorkItem, WorkSection } from '@/engine/types';
import { nextSectionKey, WORK_UNITS } from '@/engine/workPlan';
import { docLang } from '@/i18n';
import { useApp } from '@/store/AppContext';
import { AiNote } from '@/ui/AiNote';
import { AiWorking, atLeast, workTime, type WorkJob } from '@/ui/AiWorking';
import { clientLang } from '@/ui/ClientLanguage';
import { Button, C, Card, Chip, Field, H2, Label, Muted, NumberField, Screen, Segmented, mono } from '@/ui/kit';
import { Text } from '@/ui/text';
import { writeScope } from '@/ui/writeScope';

const newId = () => `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * The work for one job: the stages Studwise wrote for it and the items under each, priced from the contractor's own
 * prices. The contractor checks it, changes what is off, and builds the estimate from it.
 */
export default function Work() {
  const app = useApp();
  const { draft, setDraft, commitDraft, priceBook, presets, pastJobs, profile } = app;
  const [working, setWorking] = useState<WorkJob | null>(null);
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [editSection, setEditSection] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const lang = docLang();

  const work = useMemo(() => draft?.work ?? [], [draft?.work]);
  const jt = draft ? jobType(draft.jobTypeId) : null;

  // Priced as it stands, so every change shows its cost right away.
  const priced = useMemo(() => {
    if (!draft || !profile) return null;
    return buildEstimate({
      jobTypeId: draft.jobTypeId, mode: 'detailed', finish: draft.finish, answers: draft.answers, customItems: [], work,
      markupPct: draft.markupPct ?? profile.markupPct, minMarkupPct: profile.minMarkupPct, salesTaxPct: profile.salesTaxPct,
      priceBook, presets, pastJobs,
    });
  }, [draft, profile, work, priceBook, presets, pastJobs]);

  if (!draft || !jt || !draft.work) return <Redirect href="/new" />;

  const setWork = (next: WorkSection[]) => setDraft({ ...draft, work: next });
  const patchSection = (key: string, patch: Partial<WorkSection>) => setWork(work.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  // Changing an item yourself means it is yours: the "check it" mark goes.
  const patchItem = (key: string, id: string, patch: Partial<WorkItem>) =>
    patchSection(key, { items: work.find((s) => s.key === key)!.items.map((i) => (i.id === id ? { ...i, ...patch, from: 'you' } : i)) });
  const removeItem = (key: string, id: string) => patchSection(key, { items: work.find((s) => s.key === key)!.items.filter((i) => i.id !== id) });
  const addItem = (key: string, item: WorkItem) => {
    patchSection(key, { items: [...work.find((s) => s.key === key)!.items, item] });
    setAdding(null);
    setOpenItem(item.id);
  };
  const addSection = () => {
    const key = nextSectionKey(work);
    setWork([...work, { key, title: 'New section', vi: 'Phần mới', items: [] }]);
    setEditSection(key);
    setAdding(key);
  };
  const setAnswer = (id: string, v: AnswerValue) => setDraft({ ...draft, answers: { ...draft.answers, [id]: v } });

  const costOf = (i: WorkItem) => {
    const l = priced?.lines.find((x) => x.assemblyId === (i.assemblyId ?? `w:${i.id}`));
    return l ? l.labor + l.materials : 0;
  };
  const nameOf = (x: { title?: string; name?: string; vi: string }) => (lang === 'vi' ? x.vi : x.title ?? x.name) || x.title || x.name || '';
  const size = Number(draft.answers.sizeSf) || 0;
  const count = pricedWork(work).reduce((t, s) => t + s.items.length, 0);
  const toCheck = work.flatMap((s) => s.items).filter((i) => i.from === 'photo' || i.from === 'assumed').length;
  const ownQuestions = jt.questions.filter((q) => q.custom);

  const build = async () => {
    if (working) return;
    const editing = !!draft.id;
    const ms = workTime(1800 + count * 120 + draft.photos.length * 200);
    setWorking({
      title: editing ? 'Updating your estimate' : 'Building your estimate',
      steps: ['Pricing labor and materials', 'Checking code items and permits', 'Comparing with your past jobs', 'Adding markup and tax'],
      ms,
    });
    const started = Date.now();
    // Sections left empty are not part of the job.
    const id = commitDraft({ ...draft, work: work.filter((s) => s.items.length > 0) });
    // Studwise writes the full scope of work for the quote in the background (only if the wording is still its own).
    setTimeout(() => {
      const est = app.snapshot().estimates.find((e) => e.id === id);
      if (est) void writeScope(id, clientLang(est), app, true);
    }, 50);
    await atLeast(started, ms);
    setWorking(null);
    setDraft(null);
    // Editing: the job is already underneath, so just go back to it.
    if (editing && router.canGoBack()) router.back();
    else router.replace(`/job/${id}`);
  };

  return (
    <Screen footer={
      <View style={{ gap: 10 }}>
        {priced && count > 0 ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Muted style={{ fontSize: 13 }}>{`Your cost ${money(priced.cost)} · markup ${draft.markupPct ?? profile?.markupPct ?? 0}%`}</Muted>
            <Text style={{ fontFamily: mono, fontSize: 17, fontWeight: '700', color: C.ink }}>{money(priced.price)}</Text>
          </View>
        ) : null}
        <Button title={draft.id ? 'Update estimate' : 'Build estimate'} icon="flash" onPress={build} disabled={!!working || count === 0} />
      </View>
    }>
      <AiWorking job={working} />
      <View style={{ gap: 4 }}>
        <H2 raw>{draft.title}</H2>
        <Muted>{[draft.title.trim() === jt.name ? '' : jt.name, jt.unit !== 'JOB' && size > 0 ? qtyWithUnit(size, jt.unit) : ''].filter(Boolean).join(' · ') || jt.name}</Muted>
      </View>

      {work.length === 0 ? (
        <Card>
          <H2>Write the work for this job</H2>
          <Muted>Add a section for each stage of the job (demo, plumbing, tile…) and the items under it. Each item is priced from your price book, or from your hours and materials.</Muted>
        </Card>
      ) : toCheck > 0 ? (
        <Muted>{`Studwise wrote this list for this job. Items marked ● are its own reading of the job (${toCheck}): check them against what you saw on site. Tap any item to change it.`}</Muted>
      ) : (
        <Muted>Tap any item to change it. Prices come from your price book, your hours and your materials.</Muted>
      )}

      {draft.aiNotes && draft.aiNotes.length > 0 ? (
        <Card style={{ backgroundColor: C.infoBg }}>
          <Text style={{ fontWeight: '700', color: C.infoInk }}>Studwise noticed</Text>
          {draft.aiNotes.map((n, i) => (
            <AiNote key={`${i}-${n}`} note={n} photos={draft.photos}
              onDismiss={() => setDraft({ ...draft, aiNotes: draft.aiNotes!.filter((_, j) => j !== i) })} />
          ))}
          <Text style={{ color: C.infoInk, fontSize: 12 }}>Tap × on anything that’s wrong. Only what you keep is saved with the estimate.</Text>
        </Card>
      ) : null}

      <View style={{ gap: 6 }}>
        <Label>Finish level</Label>
        <Segmented<FinishLevel> value={draft.finish} onChange={(f) => setDraft({ ...draft, finish: f })}
          options={(['basic', 'mid', 'high'] as FinishLevel[]).map((f) => ({ value: f, label: FINISH_LABELS[f].en }))} />
      </View>

      {work.map((sec) => {
        const total = priced?.trades.find((t) => t.trade === sec.key);
        return (
          <Card key={sec.key} style={{ gap: 0, paddingVertical: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Rename ${nameOf(sec)}`} style={{ flex: 1 }}
                onPress={() => setEditSection(editSection === sec.key ? null : sec.key)}>
                <Text raw style={{ color: C.ink, fontSize: 17, fontWeight: '700' }}>{nameOf(sec)}</Text>
              </Pressable>
              <Text style={{ fontFamily: mono, color: C.ink2, fontSize: 15 }}>{money(total?.cost ?? 0)}</Text>
            </View>
            {editSection === sec.key ? (
              <View style={{ gap: 8, paddingBottom: 10 }}>
                <Field label="Section name" value={nameOf(sec)} maxLength={60} onChangeText={(v) => patchSection(sec.key, { title: v, vi: v })} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button kind="secondary" title="Done" style={{ flex: 1 }} onPress={() => setEditSection(null)} />
                  <Button kind="danger" title="Remove section" style={{ flex: 1 }} onPress={() => { setWork(work.filter((x) => x.key !== sec.key)); setEditSection(null); }} />
                </View>
              </View>
            ) : null}

            {sec.items.map((i) => (
              <View key={i.id} style={{ borderTopWidth: 1, borderColor: C.line }}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Change ${nameOf(i)}`} onPress={() => setOpenItem(openItem === i.id ? null : i.id)}
                  style={{ flexDirection: 'row', gap: 10, paddingVertical: 10 }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text raw style={{ color: C.ink, fontSize: 15, fontWeight: '600' }}>{nameOf(i)}</Text>
                    <Muted style={{ fontSize: 13 }}>
                      {i.assemblyId ? (i.labor != null ? `${qtyFmt(i.qty)} ${i.unit} · your price for this job` : `${qtyFmt(i.qty)} ${i.unit} · your price book`) : `${i.unit === 'LS' ? '' : `${qtyFmt(i.qty)} ${i.unit} · `}${qtyFmt(i.hours ?? 0)} hr · ${money(i.materials ?? 0)} materials`}
                    </Muted>
                    {i.from === 'photo' || i.from === 'assumed' ? (
                      <Text style={{ fontSize: 12, fontWeight: '600', color: C.warnInk }}>
                        {i.from === 'photo' ? '● From a photo: check it' : '● Studwise’s judgment for this job: check it'}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={{ fontFamily: mono, color: i.qty > 0 ? C.ink : C.muted, fontSize: 15 }}>{money(costOf(i))}</Text>
                </Pressable>
                {openItem === i.id ? (
                  <ItemEditor item={i} name={nameOf(i)} hourly={hourlyRate(priceBook)}
                    laborUnit={i.assemblyId && ASSEMBLY_BY_ID[i.assemblyId]?.labor > 0 ? priced?.lines.find((x) => x.assemblyId === i.assemblyId)?.laborUnit ?? laborRate(i.assemblyId, priceBook) : undefined}
                    onChange={(patch) => patchItem(sec.key, i.id, patch)}
                    onRemove={() => { removeItem(sec.key, i.id); setOpenItem(null); }}
                    onDone={() => setOpenItem(null)} />
                ) : null}
              </View>
            ))}

            <View style={{ borderTopWidth: sec.items.length ? 1 : 0, borderColor: C.line, paddingVertical: 4 }}>
              {adding === sec.key
                ? <AddItem onAdd={(item) => addItem(sec.key, item)} onCancel={() => setAdding(null)} />
                : <Button kind="ghost" title="+ Add item" onPress={() => { setAdding(sec.key); setOpenItem(null); }} />}
            </View>
          </Card>
        );
      })}

      <Button kind="secondary" title="+ Add a section" onPress={addSection} />

      {ownQuestions.length > 0 ? (
        <Card>
          <H2>Your own questions</H2>
          {ownQuestions.map((q) => <OwnQuestion key={q.id} q={q} value={draft.answers[q.id]} onChange={(v) => setAnswer(q.id, v)} />)}
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

/** Change one item: how much of it, and for work that is not in the price book, its name, hours and materials. */
function ItemEditor({ item, name, hourly, laborUnit, onChange, onRemove, onDone }: {
  item: WorkItem; name: string; hourly: number;
  /** A price-book task's labor cost per unit as priced now; none for a materials-only task. */
  laborUnit?: number;
  onChange: (patch: Partial<WorkItem>) => void; onRemove: () => void; onDone: () => void;
}) {
  return (
    <View style={{ gap: 10, paddingBottom: 12 }}>
      {item.assemblyId ? (
        <>
          <NumberField label="How much" suffix={item.unit} value={item.qty} onChange={(qty) => onChange({ qty })} />
          {laborUnit != null ? (
            <NumberField label={`Your labor cost per ${item.unit}`} suffix="$" value={item.labor ?? laborUnit} max={100000} onChange={(labor) => onChange({ labor })}
              help="From your price book. Change it here when this job is different. Change the same work on two jobs and Studwise uses your number from then on." />
          ) : <Muted style={{ fontSize: 13 }}>Materials only, priced from your price book (Me → Price book).</Muted>}
        </>
      ) : (
        <>
          <Field label="Work" value={name} maxLength={80} onChangeText={(v) => onChange({ name: v, vi: v })} />
          {item.unit === 'LS' ? null : <NumberField label="How much" suffix={item.unit} value={item.qty} onChange={(qty) => onChange({ qty })} />}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <NumberField label="Labor hours" suffix="hr" style={{ flex: 1 }} value={item.hours ?? 0} max={2000} onChange={(hours) => onChange({ hours })} />
            <NumberField label="Materials (your cost)" suffix="$" style={{ flex: 1 }} value={item.materials ?? 0} max={250000} onChange={(materials) => onChange({ materials })} />
          </View>
          <Muted style={{ fontSize: 13 }}>{`Hours and materials are for the whole item. Labor is priced at your cost of ${rate(hourly)} per hour (Me → Price book).`}</Muted>
        </>
      )}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button kind="secondary" title="Done" style={{ flex: 1 }} onPress={onDone} />
        <Button kind="danger" title="Remove" style={{ flex: 1 }} onPress={onRemove} />
      </View>
    </View>
  );
}

/** Add an item to a section: pick it from the price book, or write it with its hours and materials. */
function AddItem({ onAdd, onCancel }: { onAdd: (item: WorkItem) => void; onCancel: () => void }) {
  const [search, setSearch] = useState('');
  const [unit, setUnit] = useState('EA');
  const lang = docLang();
  const q = search.trim().toLowerCase();
  const found = q.length < 2 ? [] : ASSEMBLIES.filter((a) => a.name.toLowerCase().includes(q) || a.vi.toLowerCase().includes(q) || TRADE_NAMES[a.trade].en.toLowerCase().includes(q)).slice(0, 8);
  const own = (): WorkItem => ({ id: newId(), name: search.trim(), vi: search.trim(), qty: 1, unit, hours: 0, materials: 0, from: 'you' });
  return (
    <View style={{ gap: 10, paddingVertical: 8 }}>
      <Field label="What work?" value={search} onChangeText={setSearch} maxLength={80} autoFocus placeholder="e.g. vapor barrier, outlet, haul away" />
      {found.map((a) => (
        <Pressable key={a.id} accessibilityRole="button" onPress={() => onAdd({ id: newId(), assemblyId: a.id, name: a.name, vi: a.vi, qty: 1, unit: a.unit, from: 'you' })}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
          <Ionicons name="add-circle-outline" size={20} color={C.accent} />
          <View style={{ flex: 1 }}>
            <Text raw style={{ color: C.ink, fontSize: 15 }}>{lang === 'vi' ? a.vi : a.name}</Text>
            <Muted style={{ fontSize: 12 }}>{`From your price book · per ${a.unit}`}</Muted>
          </View>
        </Pressable>
      ))}
      {q.length >= 2 ? (
        <View style={{ gap: 8 }}>
          <Label>Or add it as your own item, measured in</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {WORK_UNITS.map((u) => <Chip key={u} label={u} selected={unit === u} onPress={() => setUnit(u)} />)}
          </View>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button kind="secondary" title="Cancel" style={{ flex: 1 }} onPress={onCancel} />
        <Button title="Add my own item" style={{ flex: 1 }} disabled={q.length < 2} onPress={() => onAdd(own())} />
      </View>
    </View>
  );
}

/** One of the contractor's own questions for this type of work (asked on every job of the type, priced if they gave it a price). */
function OwnQuestion({ q, value, onChange }: { q: Question; value: AnswerValue | undefined; onChange: (v: AnswerValue) => void }) {
  const priceHelp = q.price ? (q.kind === 'number' ? `You charge $${q.price} per ${q.unit || 'each'}.` : `Adds $${q.price} if yes.`) : undefined;
  if (q.kind === 'number') {
    const n = typeof value === 'number' ? value : Number(value ?? q.default);
    return <NumberField label={q.label} suffix={q.unit} help={q.help ?? priceHelp} value={Number.isFinite(n) ? n : Number(q.default)} onChange={onChange} />;
  }
  if (q.kind === 'yesno') {
    const on = value === true || value === 'yes';
    return (
      <View style={{ gap: 6 }}>
        <Label>{q.label}</Label>
        <Segmented<'yes' | 'no'> value={on ? 'yes' : 'no'} onChange={(v) => onChange(v === 'yes')}
          options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
        {q.help ?? priceHelp ? <Muted style={{ fontSize: 13 }}>{q.help ?? priceHelp}</Muted> : null}
      </View>
    );
  }
  if (q.kind === 'choice' && q.options?.length) {
    return (
      <View style={{ gap: 6 }}>
        <Label>{q.label}</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {q.options.map((o) => <Chip key={o.value} label={o.label} selected={value === o.value} onPress={() => onChange(o.value)} />)}
        </View>
      </View>
    );
  }
  return <Field label={q.label} help={q.help} value={typeof value === 'string' ? value : ''} onChangeText={onChange} maxLength={300} />;
}
