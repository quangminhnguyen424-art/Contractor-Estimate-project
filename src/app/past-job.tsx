import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { money, newId } from '@/engine/format';
import { FINISH_LABELS, jobType, perUnit } from '@/engine/jobTypes';
import type { FinishLevel, JobTypeId } from '@/engine/types';
import { useApp } from '@/store/AppContext';
import { aiFor } from '@/ui/host';
import { JobTypeChips } from '@/ui/JobTypes';
import { Banner, Button, C, Card, Chip, Field, H2, Label, Muted, NumberField, Screen, Segmented } from '@/ui/kit';
import { notify } from '@/ui/notify';

export default function PastJobScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { pastJobs, savePastJob, deletePastJob, apiKey, profile } = useApp();
  const [showAll, setShowAll] = useState(false);
  const existing = pastJobs.find((j) => j.id === id);

  const [paste, setPaste] = useState('');
  const [found, setFound] = useState<string | null>(null);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [jobTypeId, setJobTypeId] = useState<JobTypeId>(existing?.jobTypeId ?? 'bathroom');
  const [sizeSf, setSizeSf] = useState(existing?.sizeSf ?? 0);
  const [price, setPrice] = useState(existing?.price ?? 0);
  const [finish, setFinish] = useState<FinishLevel>(existing?.finish ?? 'mid');
  const [date, setDate] = useState(existing?.date.slice(0, 10) ?? new Date().toISOString().slice(0, 10));

  const read = async () => {
    const r = await aiFor(apiKey).extractPastJob(paste);
    if (r.error) notify('Claude could not read this', `${r.error}\n\nUsed the offline reader instead.`);
    const got: string[] = [];
    if (r.jobTypeId) { setJobTypeId(r.jobTypeId); got.push('job type'); }
    if (r.sizeSf) { setSizeSf(r.sizeSf); got.push(`${r.sizeSf} SF`); }
    if (r.price) { setPrice(r.price); got.push(`total ${money(r.price)}`); }
    if (r.finish) { setFinish(r.finish); got.push(`${FINISH_LABELS[r.finish].en} finish`); }
    if (r.title && !title) setTitle(r.title);
    setFound(got.length ? `Found: ${got.join(', ')}. Check and fix below.` : "Couldn't find a size or total. Fill them in below.");
  };

  const unit = jobType(jobTypeId).unit;
  const qty = unit === 'JOB' ? 1 : sizeSf;
  const mine = (profile?.specialties ?? []).filter((x) => x !== 'small');
  const valid = title.trim() && qty > 0 && price > 0;
  const save = () => {
    savePastJob({ id: existing?.id ?? newId(), title: title.trim(), jobTypeId, sizeSf: qty, price, finish, date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T12:00:00` : new Date().toISOString() });
    router.back();
  };

  return (
    <Screen footer={<Button title="Save past job" disabled={!valid} onPress={save} />}>
      {!existing ? (
        <Card>
          <H2>Paste an old quote or invoice</H2>
          <Muted>Copy the text from an email, PDF or text message. The app pulls out the job type, size and total.</Muted>
          <Field label="Quote text" multiline value={paste} onChangeText={setPaste} placeholder={'e.g. Hall bath remodel, 45 sq ft, mid grade… Total $18,500'} />
          <Button kind="secondary" title="Read it" disabled={paste.trim().length < 5} onPress={read} />
          {found ? <Banner tone="info" title={found} /> : null}
        </Card>
      ) : null}

      <Field label="Job name" value={title} onChangeText={setTitle} placeholder="e.g. Kim hall bathroom" />
      <Label>Job type</Label>
      <JobTypeChips selected={[jobTypeId]} onToggle={setJobTypeId}
        only={showAll || mine.length === 0 ? undefined : [...mine, ...(mine.includes(jobTypeId) ? [] : [jobTypeId])]} />
      <View style={{ flexDirection: 'row' }}>
        <Chip label={showAll ? 'Show mine only' : 'All types of work…'} onPress={() => setShowAll(!showAll)} />
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {unit === 'JOB' ? null : (
          <NumberField label={unit === 'EA' ? 'How many' : unit === 'LF' ? 'Length' : 'Size'} suffix={unit === 'EA' ? undefined : unit}
            value={sizeSf} onChange={setSizeSf} style={{ flex: 1 }} />
        )}
        <NumberField label="Price charged" suffix="$" value={price} onChange={setPrice} style={{ flex: 1 }} help="Before tax" />
      </View>
      {qty > 0 && price > 0 && unit !== 'JOB' ? <Text style={{ color: C.okInk, fontWeight: '600' }}>{money(price / qty)}{perUnit(unit)}</Text> : null}
      <Label>Finish level</Label>
      <Segmented<FinishLevel> value={finish} onChange={setFinish}
        options={(['basic', 'mid', 'high'] as FinishLevel[]).map((f) => ({ value: f, label: FINISH_LABELS[f].en }))} />
      <Field label="Date finished" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />

      {existing ? (
        <Pressable accessibilityRole="button" style={{ alignSelf: 'center', padding: 12 }} onPress={() => { deletePastJob(existing.id); router.back(); }}>
          <Text style={{ color: '#B42318', fontWeight: '600' }}>Delete past job</Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}
