import { View } from 'react-native';

import { FINISH_LABELS } from '@/engine/jobTypes';
import { CLIENT_OPTIONS, SIZE_OPTIONS, SUB_OPTIONS } from '@/engine/profile';
import type { FinishLevel, WorkProfile } from '@/engine/types';

import { Chip, Field, Label, Muted, Segmented } from './kit';

function MultiChips({ options, value, onChange }: { options: { value: string; label: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => (
        <Chip key={o.value} label={o.label} selected={value.includes(o.value)}
          onPress={() => onChange(value.includes(o.value) ? value.filter((x) => x !== o.value) : [...value, o.value])} />
      ))}
    </View>
  );
}

/** The setup interview: how this contractor usually works. Claude reads it with every job. */
export function WorkProfileForm({ value, onChange }: { value: WorkProfile; onChange: (w: WorkProfile) => void }) {
  const set = <K extends keyof WorkProfile>(k: K, v: WorkProfile[K]) => onChange({ ...value, [k]: v });
  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 6 }}>
        <Label>Who are your clients?</Label>
        <MultiChips options={CLIENT_OPTIONS} value={value.clients} onChange={(v) => set('clients', v)} />
      </View>
      <View style={{ gap: 6 }}>
        <Label>How big are your usual jobs?</Label>
        <MultiChips options={SIZE_OPTIONS} value={value.jobSizes} onChange={(v) => set('jobSizes', v)} />
      </View>
      <View style={{ gap: 6 }}>
        <Label>What finish level do you usually build?</Label>
        <Segmented<FinishLevel> value={value.finish ?? ('' as FinishLevel)} onChange={(v) => set('finish', v)}
          options={(['basic', 'mid', 'high'] as FinishLevel[]).map((f) => ({ value: f, label: FINISH_LABELS[f].en }))} />
        <Muted style={{ fontSize: 13 }}>New estimates start at this level.</Muted>
      </View>
      <View style={{ gap: 6 }}>
        <Label>Which trades do you sub out?</Label>
        <MultiChips options={SUB_OPTIONS} value={value.subOut} onChange={(v) => set('subOut', v)} />
        <Muted style={{ fontSize: 13 }}>Leave blank if your crew does it all.</Muted>
      </View>
      <Field label="Where do you work?" value={value.area} onChangeText={(v) => set('area', v)} maxLength={120}
        placeholder="e.g. King and Pierce County" />
      <Field label="What do you always include?" value={value.alwaysInclude} onChangeText={(v) => set('alwaysInclude', v)} maxLength={300}
        placeholder="e.g. Permits, dump fees, final clean" />
      <Field label="What do you never do, or always leave out?" value={value.neverDo} onChangeText={(v) => set('neverDo', v)} maxLength={300}
        placeholder="e.g. No asbestos work, owner buys appliances" />
    </View>
  );
}
