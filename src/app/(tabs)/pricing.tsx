import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { historyPerSf, presetFor } from '@/engine/estimator';
import { dateFmt, money } from '@/engine/format';
import { FINISH_LABELS, JOB_TYPE_BY_ID } from '@/engine/jobTypes';
import type { FinishLevel, JobTypeId } from '@/engine/types';
import { useApp } from '@/store/AppContext';
import { Button, C, Card, H2, Muted, NumberField, Screen, mono } from '@/ui/kit';

const FINISHES: FinishLevel[] = ['basic', 'mid', 'high'];

export default function Pricing() {
  const { profile, presets, savePresets, pastJobs } = useApp();
  const types = (profile?.specialties ?? []).filter((id) => id !== 'small') as JobTypeId[];

  const setPreset = (id: JobTypeId, f: FinishLevel, v: number) =>
    savePresets({ ...presets, [id]: { ...JOB_TYPE_BY_ID[id].defaultPreset, ...presets[id], [f]: v } });

  return (
    <Screen>
      <Muted>Your prices drive every estimate. Set them once; the app keeps learning from your past jobs.</Muted>

      <H2>Price per SF by job type</H2>
      {types.map((id) => {
        const jt = JOB_TYPE_BY_ID[id];
        const learned = FINISHES.map((f) => ({ f, h: historyPerSf(id, f, pastJobs) })).filter((x) => x.h.count > 0 && x.h.exactFinish);
        return (
          <Card key={id}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink }}>{jt.name}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {FINISHES.map((f) => (
                <NumberField key={f} label={FINISH_LABELS[f].en} suffix="/SF" value={presetFor(id, f, presets)}
                  onChange={(v) => setPreset(id, f, v)} style={{ flex: 1 }} />
              ))}
            </View>
            {learned.length > 0 ? (
              <Text style={{ color: C.okInk, fontSize: 13 }}>
                Learned from your jobs: {learned.map((x) => `${FINISH_LABELS[x.f].en} ${money(x.h.perSf!)}/SF (${x.h.count})`).join(' · ')}
              </Text>
            ) : (
              <Muted style={{ fontSize: 13 }}>Add past jobs of this type to see what you really charge.</Muted>
            )}
          </Card>
        );
      })}

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
        <H2>Past jobs ({pastJobs.length})</H2>
      </View>
      <Muted>Add jobs you’ve already done, or paste an old quote, and the app works out your real price per SF.</Muted>
      <Button kind="secondary" title="+ Add past job" onPress={() => router.push('/past-job')} />
      {pastJobs.map((j) => (
        <Pressable key={j.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/past-job', params: { id: j.id } })}>
          <Card style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <Text style={{ fontWeight: '600', color: C.ink, flex: 1 }} numberOfLines={1}>{j.title}</Text>
              <Text style={{ fontFamily: mono, color: C.ink }}>{money(j.price)}</Text>
            </View>
            <Muted style={{ fontSize: 13 }}>
              {JOB_TYPE_BY_ID[j.jobTypeId].name} · {j.sizeSf} SF · {FINISH_LABELS[j.finish].en} · {money(j.price / j.sizeSf)}/SF · {dateFmt(j.date)}
            </Muted>
          </Card>
        </Pressable>
      ))}

      <H2 style={{ marginTop: 6 }}>Price book</H2>
      <Muted>Labor rates and material prices used in Detailed estimates.</Muted>
      <Button kind="secondary" title="Open price book" onPress={() => router.push('/price-book')} />
    </Screen>
  );
}
