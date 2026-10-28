import { useState } from 'react';
import { Alert, Platform, Pressable, Text, View } from 'react-native';

import { getAI } from '@/engine/ai';
import { JOB_TYPES } from '@/engine/jobTypes';
import type { JobTypeId, Lang, PaymentMilestone, Profile } from '@/engine/types';
import { useApp } from '@/store/AppContext';
import { Banner, Button, C, Card, Chip, Field, H2, Label, Muted, NumberField, Screen, Segmented } from '@/ui/kit';

export default function Settings() {
  const { profile, saveProfile, resetAll } = useApp();
  const [p, setP] = useState<Profile>(profile!);
  const [saved, setSaved] = useState(false);
  if (!profile) return null;

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => { setP({ ...p, [k]: v }); setSaved(false); };
  const toggle = (id: JobTypeId) => set('specialties', p.specialties.includes(id) ? p.specialties.filter((x) => x !== id) : [...p.specialties, id]);
  const setMilestone = (i: number, patch: Partial<PaymentMilestone>) => set('schedule', p.schedule.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const schedTotal = p.schedule.reduce((t, m) => t + m.pct, 0);
  const ai = getAI();

  const reset = () => {
    const go = () => resetAll();
    if (Platform.OS === 'web') return go();
    Alert.alert('Erase everything?', 'Deletes your profile, prices, past jobs and estimates on this phone.', [
      { text: 'Cancel', style: 'cancel' }, { text: 'Erase', style: 'destructive', onPress: go },
    ]);
  };

  return (
    <Screen footer={<Button title={saved ? 'Saved ✓' : 'Save settings'} disabled={schedTotal !== 100}
      onPress={() => { saveProfile({ ...p, specialties: Array.from(new Set([...p.specialties, 'small' as JobTypeId])) }); setSaved(true); }} />}>
      <Card>
        <H2>Company</H2>
        <Field label="Company name" value={p.companyName} onChangeText={(v) => set('companyName', v)} />
        <Field label="Your name" value={p.contactName} onChangeText={(v) => set('contactName', v)} />
        <Field label="Phone" value={p.phone} onChangeText={(v) => set('phone', v)} keyboardType="phone-pad" />
        <Field label="Email" value={p.email} onChangeText={(v) => set('email', v)} autoCapitalize="none" keyboardType="email-address" />
        <Field label="Contractor registration #" value={p.license} onChangeText={(v) => set('license', v)} autoCapitalize="characters" />
      </Card>

      <Card>
        <H2>Work you do</H2>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {JOB_TYPES.filter((j) => j.id !== 'small').map((j) => (
            <Chip key={j.id} label={j.name} selected={p.specialties.includes(j.id)} onPress={() => toggle(j.id)} />
          ))}
        </View>
      </Card>

      <Card>
        <H2>Pricing rules</H2>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <NumberField label="Default markup" suffix="%" value={p.markupPct} onChange={(v) => set('markupPct', v)} style={{ flex: 1 }} />
          <NumberField label="Never below" suffix="%" value={p.minMarkupPct} onChange={(v) => set('minMarkupPct', v)} style={{ flex: 1 }} />
        </View>
        <NumberField label="Sales tax rate" suffix="%" value={p.salesTaxPct} onChange={(v) => set('salesTaxPct', v)}
          help="Added to the client total. Use the rate where the work is done." />
        <NumberField label="Quote valid for" suffix="days" value={p.quoteValidDays} onChange={(v) => set('quoteValidDays', v)} decimals={false} />
        <Label>Default quote language</Label>
        <Segmented<Lang> value={p.quoteLanguage} onChange={(v) => set('quoteLanguage', v)}
          options={[{ value: 'en', label: 'English' }, { value: 'vi', label: 'Tiếng Việt' }]} />
      </Card>

      <Card>
        <H2>Payment schedule</H2>
        {p.schedule.map((m, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
            <Field label={`Step ${i + 1}`} value={m.label} onChangeText={(v) => setMilestone(i, { label: v })} style={{ flex: 2 }} />
            <NumberField label="Percent" suffix="%" value={m.pct} onChange={(v) => setMilestone(i, { pct: v })} style={{ flex: 1 }} />
          </View>
        ))}
        {schedTotal !== 100 ? <Banner tone="warn" title={`Adds up to ${schedTotal}%. It needs to total 100%.`} /> : null}
      </Card>

      <Card>
        <H2>AI</H2>
        <Text style={{ color: C.ink }}>Using: {ai.name}</Text>
        <Muted style={{ fontSize: 13 }}>
          Demo AI reads sizes and counts from your description on the phone. Connecting Claude adds photo analysis, smarter questions and reading quote photos.
        </Muted>
      </Card>

      <Pressable accessibilityRole="button" onPress={reset} style={{ alignSelf: 'center', padding: 12 }}>
        <Text style={{ color: '#B42318', fontWeight: '600' }}>Erase all data on this phone</Text>
      </Pressable>
    </Screen>
  );
}
