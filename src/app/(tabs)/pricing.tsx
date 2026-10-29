import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { historyPerSf, presetFor } from '@/engine/estimator';
import { dateFmt, money, newId } from '@/engine/format';
import { FINISH_LABELS, jobType, perUnit, qtyWithUnit } from '@/engine/jobTypes';
import type { FinishLevel, JobTypeId } from '@/engine/types';
import { useApp } from '@/store/AppContext';
import { AddOwnType, priceSuffix } from '@/ui/JobTypes';
import { Badge, Button, C, Card, H2, Muted, NumberField, Screen, mono } from '@/ui/kit';

const FINISHES: FinishLevel[] = ['basic', 'mid', 'high'];

export default function Pricing() {
  const { profile, presets, savePresets, pastJobs, saveCustomType, saveProfile, customQuestions } = useApp();
  const types = (profile?.specialties ?? []).filter((id) => id !== 'small') as JobTypeId[];

  const setPreset = (id: JobTypeId, f: FinishLevel, v: number) =>
    savePresets({ ...presets, [id]: { ...jobType(id).defaultPreset, ...presets[id], [f]: v } });

  const addOwn = (name: string, unit: 'SF' | 'LF' | 'EA' | 'JOB') => {
    if (!profile) return;
    const id = `ct_${newId()}`;
    saveCustomType({ id, name, unit });
    saveProfile({ ...profile, specialties: [...profile.specialties, id] });
  };

  return (
    <Screen>
      <Muted>Your prices drive every estimate. Set them once; the app keeps learning from your past jobs and the jobs you win.</Muted>

      <H2>Your prices by type of work</H2>
      {types.map((id) => {
        const jt = jobType(id);
        const per = perUnit(jt.unit);
        const learned = FINISHES.map((f) => ({ f, h: historyPerSf(id, f, pastJobs) })).filter((x) => x.h.count > 0 && x.h.exactFinish);
        const qCount = customQuestions[id]?.length ?? 0;
        return (
          <Card key={id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink, flex: 1 }}>{jt.name}</Text>
              {jt.custom ? <Badge label="Your own" tone="info" /> : null}
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {FINISHES.map((f) => (
                <NumberField key={f} label={FINISH_LABELS[f].en} suffix={priceSuffix(jt.unit)} value={presetFor(id, f, presets)}
                  onChange={(v) => setPreset(id, f, v)} style={{ flex: 1 }} />
              ))}
            </View>
            {learned.length > 0 ? (
              <Text style={{ color: C.okInk, fontSize: 13 }}>
                Learned from your jobs: {learned.map((x) => `${FINISH_LABELS[x.f].en} ${money(x.h.perSf!)}${per} (${x.h.count})`).join(' · ')}
              </Text>
            ) : (
              <Muted style={{ fontSize: 13 }}>Add past jobs of this type, or mark estimates Won, to see what you really charge.</Muted>
            )}
            <Button kind="ghost" title={qCount ? `Your questions (${qCount}) and settings` : '+ Add your own questions'}
              onPress={() => router.push({ pathname: '/job-type', params: { id } })} />
          </Card>
        );
      })}

      <Card>
        <H2>Add a type of work</H2>
        <Muted style={{ fontSize: 13 }}>
          Any work you do that isn’t listed. To turn listed types on or off, use Settings → Work you do.
        </Muted>
        <AddOwnType onAdd={addOwn} />
      </Card>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
        <H2>Past jobs ({pastJobs.length})</H2>
      </View>
      <Muted>Add jobs you’ve already done, or paste an old quote, and the app works out what you really charge. Jobs you mark Won are added here for you.</Muted>
      <Button kind="secondary" title="+ Add past job" onPress={() => router.push('/past-job')} />
      {pastJobs.map((j) => {
        const jt = jobType(j.jobTypeId);
        return (
          <Pressable key={j.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/past-job', params: { id: j.id } })}>
            <Card style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Text style={{ fontWeight: '600', color: C.ink, flex: 1 }} numberOfLines={1}>{j.title}</Text>
                <Text style={{ fontFamily: mono, color: C.ink }}>{money(j.price)}</Text>
              </View>
              <Muted style={{ fontSize: 13 }}>
                {jt.name}{jt.unit === 'JOB' ? '' : ` · ${qtyWithUnit(j.sizeSf, jt.unit)} · ${money(j.price / j.sizeSf)}${perUnit(jt.unit)}`} · {FINISH_LABELS[j.finish].en} · {dateFmt(j.date)}
              </Muted>
            </Card>
          </Pressable>
        );
      })}

      <H2 style={{ marginTop: 6 }}>Price book</H2>
      <Muted>Labor rates and material prices used in Detailed estimates.</Muted>
      <Button kind="secondary" title="Open price book" onPress={() => router.push('/price-book')} />
    </Screen>
  );
}
