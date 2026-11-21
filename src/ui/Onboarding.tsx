import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCloud } from '@/cloud/CloudProvider';
import { newId } from '@/engine/format';
import { jobType } from '@/engine/jobTypes';
import { EMPTY_WORK } from '@/engine/profile';
import type { JobTypeId, Presets } from '@/engine/types';
import { DEFAULT_SCHEDULE, useApp } from '@/store/AppContext';
import { AddOwnType, JobTypeChips } from '@/ui/JobTypes';
import { Button, C, Field, Label, Muted, NumberField, Screen } from '@/ui/kit';
import { Text } from '@/ui/text';
import { markFreshSetup } from '@/ui/welcome';

/**
 * Setup for a new account: one page. Only the company name is needed; prices start from sensible numbers and
 * everything here (and the rest: logo, markup, payment schedule, how you work) can be changed later in the Me tab.
 */
export function Onboarding({ onDone }: { onDone?: () => void; skipIntro?: boolean }) {
  const { saveProfile, savePresets, saveCustomType, profile: had, presets: hadPresets } = useApp();
  const cloud = useCloud();
  const [companyName, setCompanyName] = useState(had?.companyName ?? '');
  const [contactName, setContactName] = useState(had?.contactName ?? '');
  const [phone, setPhone] = useState(had?.phone ?? '');
  const [license, setLicense] = useState(had?.license ?? '');
  const [specialties, setSpecialties] = useState<JobTypeId[]>(had?.specialties.filter((x) => x !== 'small') ?? []);
  const [salesTaxPct, setSalesTaxPct] = useState(had?.salesTaxPct ?? 0);
  const [tried, setTried] = useState(false);
  const [adding, setAdding] = useState(false);

  const toggle = (id: JobTypeId) => setSpecialties((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const finish = () => {
    if (!companyName.trim()) { setTried(true); return; }
    const filled: Presets = {};
    for (const id of specialties) filled[id] = { ...jobType(id).defaultPreset, ...hadPresets?.[id] };
    savePresets({ ...hadPresets, ...filled });
    markFreshSetup();
    saveProfile({
      ...had,
      companyName: companyName.trim(), contactName: contactName.trim(), phone: phone.trim(), email: (had?.email || cloud.user?.email || '').trim(),
      license: license.trim(), specialties: [...specialties, 'small'], markupPct: had?.markupPct ?? 20, minMarkupPct: had?.minMarkupPct ?? 15, salesTaxPct,
      quoteValidDays: had?.quoteValidDays ?? 30, quoteLanguage: had?.quoteLanguage ?? 'en', schedule: had?.schedule ?? DEFAULT_SCHEDULE,
      about: had?.about ?? '', work: had?.work ?? EMPTY_WORK,
    });
    onDone?.();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <Screen footer={<Button title="Start estimating" onPress={finish} />}>
        <View style={{ gap: 4, paddingTop: 12 }}>
          <Text style={{ color: C.ink, fontSize: 26, fontWeight: '700', letterSpacing: -0.4 }}>Set up your company</Text>
          <Muted>This goes at the top of your quotes. You can change it any time.</Muted>
        </View>

        <Field label="Company name" value={companyName} onChangeText={setCompanyName} placeholder="Smith Remodeling LLC" error={tried && !companyName.trim() ? 'Company name is required' : null} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Field label="Your name" value={contactName} onChangeText={setContactName} style={{ flex: 1 }} />
          <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={{ flex: 1 }} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Field label="Contractor registration #" value={license} onChangeText={setLicense} autoCapitalize="characters" style={{ flex: 1.4 }} />
          <NumberField label="Sales tax" suffix="%" max={25} value={salesTaxPct} onChange={setSalesTaxPct} style={{ flex: 1 }} />
        </View>

        <View style={{ gap: 10, marginTop: 6 }}>
          <Label>What work do you do?</Label>
          <JobTypeChips selected={specialties} onToggle={toggle} />
          {adding ? (
            <AddOwnType cta="Add my type of work" onAdd={(name, unit) => {
              const id = `ct_${newId()}`;
              saveCustomType({ id, name, unit });
              setSpecialties((cur) => [...cur, id]);
              setAdding(false);
            }} />
          ) : (
            <Text onPress={() => setAdding(true)} style={{ color: C.accent, fontSize: 15, fontWeight: '500', paddingVertical: 4 }}>Add another type of work</Text>
          )}
        </View>
      </Screen>
    </SafeAreaView>
  );
}
