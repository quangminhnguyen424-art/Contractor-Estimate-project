import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { buildEstimate, presetFor } from '@/engine/estimator';
import { money, rate } from '@/engine/format';
import { defaultAnswers, FINISH_LABELS, JOB_TYPES, jobType, perUnit } from '@/engine/jobTypes';
import type { SiteProject } from '@/engine/site';
import type { FinishLevel, JobTypeId } from '@/engine/types';
import { useApp } from '@/store/AppContext';

import { Button, C, Field, NumberField, Segmented, Select, Stepper } from './kit';
import { Text } from './text';

const UNIT_WORD: Record<string, string> = { SF: 'SF', LF: 'LF', EA: 'items', JOB: '' };

/**
 * Quick price: no photos, no questions. Pick the work, the size, how many of the same, and your price per unit;
 * the quote is ready to send. For repeat work like three identical bathrooms.
 */
export function QuickPrice({ initialType, project }: { initialType?: JobTypeId | null; project?: SiteProject }) {
  const { profile, presets, savePresets, priceBook, pastJobs, commitDraft } = useApp();
  const mine = (profile?.specialties ?? []).filter((id) => id !== 'small');
  const options = [...mine, ...JOB_TYPES.map((j) => j.id).filter((id) => id !== 'small' && !mine.includes(id))];
  const [type, setType] = useState<JobTypeId>(initialType && initialType !== 'small' ? initialType : options[0] ?? 'bathroom');
  const jt = jobType(type);
  const [finish, setFinish] = useState<FinishLevel>(profile?.work?.finish ?? 'mid');
  const [size, setSize] = useState<number>(Number(defaultAnswers(type).sizeSf) || 0);
  const [count, setCount] = useState(1);
  const [client, setClient] = useState(project?.clientName ?? '');
  const [address, setAddress] = useState(project?.address ?? '');
  const price = presetFor(type, finish, presets);
  const unit = UNIT_WORD[jt.unit] ?? '';
  const perJob = jt.unit === 'JOB';
  const qty = perJob ? count : size * count;

  const pickType = (id: JobTypeId) => { setType(id); setSize(Number(defaultAnswers(id).sizeSf) || 0); };
  const setPrice = (v: number) => savePresets({ ...presets, [type]: { ...jt.defaultPreset, ...presets[type], [finish]: v } });

  const answers = perJob ? { ...defaultAnswers(type), sizeSf: 1, jobCount: count } : { ...defaultAnswers(type), sizeSf: qty };
  const preview = profile ? buildEstimate({
    jobTypeId: type, mode: 'quick', finish, answers, customItems: [], markupPct: profile.markupPct, minMarkupPct: profile.minMarkupPct,
    salesTaxPct: profile.salesTaxPct, priceBook, presets, pastJobs,
  }) : null;
  const subtotal = preview?.price ?? 0;
  const tax = Math.round(subtotal * (profile?.salesTaxPct ?? 0)) / 100;

  const create = () => {
    const name = jt.name;
    const many = count > 1 ? `${count} × ${name}` : name;
    const scope = perJob
      ? (count > 1 ? `${count} × ${name}, same scope each.` : '')
      : count > 1 ? `${count} × ${name}, ${size.toLocaleString('en-US')} ${unit} each (${qty.toLocaleString('en-US')} ${unit} total), same scope and finish.` : '';
    const id = commitDraft({
      jobTypeId: type, mode: 'quick', title: `${client.trim() ? `${client.trim()} — ` : ''}${many}`, clientName: client.trim(), address: address.trim(),
      description: '', scopeNote: scope, photos: [], finish, answers, customItems: [], heard: [],
      ...(project ? { projectId: project.id } : {}),
    });
    // Start clean next time, and open the job on top of the tabs so Back works.
    setClient(''); setAddress(''); setCount(1);
    router.push(`/job/${id}`);
  };

  return (
    <View style={{ gap: 14 }}>
      <Select<JobTypeId> label="Type of work" value={type} onChange={pickType}
        options={options.map((id) => ({ value: id, label: jobType(id).name, sub: mine.includes(id) ? 'Your work' : undefined }))} />
      <Segmented<FinishLevel> value={finish} onChange={setFinish}
        options={(['basic', 'mid', 'high'] as FinishLevel[]).map((f) => ({ value: f, label: FINISH_LABELS[f].en }))} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {perJob ? null : <NumberField label={jt.unit === 'EA' ? 'How many' : `Size of each (${unit})`} value={size} onChange={setSize} decimals={false} style={{ flex: 1 }} />}
        <NumberField label={`Your price${perUnit(jt.unit)}`} suffix="$" value={price} onChange={setPrice} style={{ flex: 1 }} />
      </View>
      <View style={{ backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 12 }}>
        <Stepper label={`How many the same? (e.g. 3 bathrooms)`} value={count} onChange={(n) => setCount(Math.max(1, Math.min(50, n)))} min={1} />
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Field label="Client (optional)" value={client} onChangeText={setClient} style={{ flex: 1 }} />
      </View>
      <Field label="Address (optional)" value={address} onChangeText={setAddress} />

      <View style={{ backgroundColor: C.infoBg, borderRadius: 20, padding: 16, gap: 6 }}>
        <Text style={{ color: C.ink2, fontSize: 14 }}>
          {perJob ? `${count} × ${rate(price)}` : `${count > 1 ? `${count} × ` : ''}${size.toLocaleString('en-US')} ${unit} × ${rate(price)}${perUnit(jt.unit)}`}
        </Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text style={{ color: C.ink, fontSize: 15 }}>Client price</Text>
          <Text style={{ color: C.accent, fontSize: 28, fontWeight: '700' }}>{money(subtotal)}</Text>
        </View>
        {tax > 0 ? <Text style={{ color: C.muted, fontSize: 13 }}>+ {profile?.salesTaxPct}% sales tax {money(tax)} = {money(subtotal + tax)} total</Text> : null}
        {!(price > 0) ? <Text style={{ color: C.danger, fontSize: 13 }}>Enter your price{perUnit(jt.unit)}: it is saved for every {jt.name} job.</Text> : null}
      </View>
      <Button title="Make the quote" icon="arrow-forward" disabled={!(price > 0) || !(qty > 0)} onPress={create} />
      <Text style={{ color: C.muted, fontSize: 12, textAlign: 'center' }}>Next you can edit the wording, have the client sign, or share the PDF. Your price is saved for next time.</Text>
    </View>
  );
}
