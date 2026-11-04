import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/ui/text';
import { newId } from '@/engine/format';
import { jobType } from '@/engine/jobTypes';
import { EMPTY_WORK } from '@/engine/profile';
import type { FinishLevel, JobTypeId, Presets, WorkProfile } from '@/engine/types';
import { DEFAULT_SCHEDULE, useApp } from '@/store/AppContext';
import { AddOwnType, JobTypeChips, priceSuffix } from '@/ui/JobTypes';
import { Art } from '@/ui/art';
import { IntroVideo } from '@/ui/IntroVideo';
import { Banner, Button, C, Card, Field, H1, H2, Muted, NumberField, Screen } from '@/ui/kit';
import { Progress, Reveal } from '@/ui/motion';
import { RestoreBackup } from '@/ui/RestoreBackup';
import { WorkProfileForm } from '@/ui/WorkProfileForm';

export default function Onboarding() {
  const { saveProfile, savePresets, saveCustomType } = useApp();
  const [about, setAbout] = useState('');
  const [work, setWork] = useState<WorkProfile>(EMPTY_WORK);
  const [step, setStep] = useState(1);
  // A short welcome video plays first; "Get started" or "Skip" goes to setup.
  const [intro, setIntro] = useState(true);
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [license, setLicense] = useState('');
  const [specialties, setSpecialties] = useState<JobTypeId[]>([]);
  const [markupPct, setMarkupPct] = useState(20);
  const [minMarkupPct, setMinMarkupPct] = useState(15);
  const [salesTaxPct, setSalesTaxPct] = useState(0);
  const [presets, setPresets] = useState<Presets>({});

  const toggle = (id: JobTypeId) =>
    setSpecialties((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const presetValue = (id: JobTypeId, f: FinishLevel) => presets[id]?.[f] ?? jobType(id).defaultPreset[f];
  const setPreset = (id: JobTypeId, f: FinishLevel, v: number) =>
    setPresets((p) => ({ ...p, [id]: { ...jobType(id).defaultPreset, ...p[id], [f]: v } }));

  const finish = () => {
    const filled: Presets = {};
    for (const id of specialties) filled[id] = { ...jobType(id).defaultPreset, ...presets[id] };
    savePresets(filled);
    saveProfile({
      companyName: companyName.trim(), contactName: contactName.trim(), phone: phone.trim(), email: email.trim(),
      license: license.trim(), specialties: [...specialties, 'small'], markupPct, minMarkupPct, salesTaxPct,
      quoteValidDays: 30, quoteLanguage: 'en', schedule: DEFAULT_SCHEDULE, about: about.trim(), work,
    });
  };

  if (intro) return <IntroVideo onDone={() => setIntro(false)} />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <Screen
        footer={
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {step > 1 ? <Button kind="secondary" title="Back" onPress={() => setStep(step - 1)} style={{ flex: 1 }} /> : null}
            {step < 4 ? (
              <Button
                title="Continue"
                style={{ flex: 2 }}
                disabled={step === 1 ? !companyName.trim() : specialties.length === 0}
                onPress={() => setStep(step + 1)}
              />
            ) : (
              <Button title="Start estimating" style={{ flex: 2 }} onPress={finish} />
            )}
          </View>
        }>
        <Muted>Step {step} of 4</Muted>
        <Progress value={step / 4} height={6} />

        {step === 1 && (
          <>
            <Reveal style={{ alignItems: 'center', gap: 4, marginTop: 4 }}>
              <Art name="hero" width={260} />
              <Text style={{ color: C.accent, fontWeight: '800', fontSize: 15, letterSpacing: 0.5 }}>WELCOME TO BIDWELL AI</Text>
              <Muted style={{ textAlign: 'center' }}>Faster estimates, organized job sites and happy clients. Two minutes to set up.</Muted>
            </Reveal>
            <H1>Your company</H1>
            <Muted>This goes on every quote you send.</Muted>
            <Field label="Company name" value={companyName} onChangeText={setCompanyName} placeholder="e.g. Smith Remodeling LLC" />
            <Field label="Your name" value={contactName} onChangeText={setContactName} />
            <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
            <Field label="Contractor registration #" value={license} onChangeText={setLicense} autoCapitalize="characters"
              help="Washington requires it on bids and contracts." />
            <RestoreBackup />
          </>
        )}

        {step === 2 && (
          <>
            <H1>What work do you do?</H1>
            <Muted>Pick everything you bid. The app only shows these job types and their questions. You can change this later.</Muted>
            <JobTypeChips selected={specialties} onToggle={toggle} />
            <Muted style={{ fontSize: 13 }}>Small jobs and repairs are always available.</Muted>
            <Card>
              <H2>Don’t see your work? Add it</H2>
              <Muted style={{ fontSize: 13 }}>Type any work you do. You set your own price and can add your own questions later in Pricing.</Muted>
              <AddOwnType cta="Add my type of work" onAdd={(name, unit) => {
                const id = `ct_${newId()}`;
                saveCustomType({ id, name, unit });
                setSpecialties((cur) => [...cur, id]);
              }} />
            </Card>
          </>
        )}

        {step === 3 && (
          <>
            <H1>Your typical jobs</H1>
            <Muted>A few questions so Claude learns how you work. It reads your answers with every job. Skip anything; change it anytime in Settings.</Muted>
            <WorkProfileForm value={work} onChange={setWork} />
            <Field label="Anything else Claude should know? (optional)" multiline value={about} onChangeText={setAbout} maxLength={2000}
              placeholder="e.g. Most of my work is basement ADU conversions for investors. I aim for 25% margin. I use LVP, not carpet." />
          </>
        )}

        {step === 4 && (
          <>
            <H1>How you charge</H1>
            <Card>
              <H2>Markup and tax</H2>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <NumberField label="Markup" suffix="%" value={markupPct} onChange={setMarkupPct} style={{ flex: 1 }} />
                <NumberField label="Never below" suffix="%" value={minMarkupPct} onChange={setMinMarkupPct} style={{ flex: 1 }} />
              </View>
              <NumberField label="Sales tax rate" suffix="%" value={salesTaxPct} onChange={setSalesTaxPct}
                help="Your local combined rate, e.g. 10.4. Look it up at dor.wa.gov." />
            </Card>
            <H2>Your prices</H2>
            <Muted>
              What you usually charge, by finish level. Used for Quick estimates and to check Detailed ones. Filled in with
              starting numbers; change them to yours. Later you can add past jobs and the app learns your real numbers.
            </Muted>
            {specialties.map((id) => (
              <Card key={id}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink }}>{jobType(id).name}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {(['basic', 'mid', 'high'] as FinishLevel[]).map((f) => (
                    <NumberField key={f} label={f === 'basic' ? 'Basic' : f === 'mid' ? 'Mid' : 'High-end'} suffix={priceSuffix(jobType(id).unit)}
                      value={presetValue(id, f)} onChange={(v) => setPreset(id, f, v)} style={{ flex: 1 }} />
                  ))}
                </View>
                {jobType(id).custom && !(presetValue(id, 'mid') > 0) ? <Muted style={{ fontSize: 13 }}>Your own type of work: enter what you charge.</Muted> : null}
              </Card>
            ))}
            {!(salesTaxPct > 0) ? <Banner tone="warn" title="Add your sales tax rate">Quotes need it to show the right total.</Banner> : null}
          </>
        )}
      </Screen>
    </SafeAreaView>
  );
}
