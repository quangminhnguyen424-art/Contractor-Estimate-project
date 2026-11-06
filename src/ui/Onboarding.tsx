import { useCloud } from '@/cloud/CloudProvider';
import { Tick } from '@/ui/tick';
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
import { markFreshSetup } from '@/ui/welcome';
import { Banner, Button, C, Card, Field, H1, H2, Muted, NumberField, Screen } from '@/ui/kit';
import { Progress, Reveal } from '@/ui/motion';
import { RestoreBackup } from '@/ui/RestoreBackup';
import { WorkProfileForm } from '@/ui/WorkProfileForm';

/**
 * Setup, step by step, after the welcome video. On a new account the fields start empty; when the account already has
 * its info (logging in on a new phone) every step is filled in, so it is a quick walk-through to check and confirm.
 */
export function Onboarding({ onDone, skipIntro }: { onDone?: () => void; skipIntro?: boolean }) {
  const { saveProfile, savePresets, saveCustomType, profile: had, presets: hadPresets } = useApp();
  const review = !!had;
  const [about, setAbout] = useState(had?.about ?? '');
  const [work, setWork] = useState<WorkProfile>(had?.work ?? EMPTY_WORK);
  const [step, setStep] = useState(1);
  // A short welcome video plays first; "Get started" or "Skip" goes to setup.
  const [intro, setIntro] = useState(!skipIntro);
  const [companyName, setCompanyName] = useState(had?.companyName ?? '');
  const [contactName, setContactName] = useState(had?.contactName ?? '');
  const [phone, setPhone] = useState(had?.phone ?? '');
  const cloud = useCloud();
  const [tips, setTips] = useState(!!had?.tipsOk);
  const [tried1, setTried1] = useState(false);
  const [email, setEmail] = useState(had?.email || cloud.user?.email || '');
  const [license, setLicense] = useState(had?.license ?? '');
  const [specialties, setSpecialties] = useState<JobTypeId[]>(had?.specialties.filter((x) => x !== 'small') ?? []);
  const [markupPct, setMarkupPct] = useState(had?.markupPct ?? 20);
  const [minMarkupPct, setMinMarkupPct] = useState(had?.minMarkupPct ?? 15);
  const [salesTaxPct, setSalesTaxPct] = useState(had?.salesTaxPct ?? 0);
  const [presets, setPresets] = useState<Presets>(hadPresets ?? {});

  const toggle = (id: JobTypeId) =>
    setSpecialties((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const presetValue = (id: JobTypeId, f: FinishLevel) => presets[id]?.[f] ?? jobType(id).defaultPreset[f];
  const setPreset = (id: JobTypeId, f: FinishLevel, v: number) =>
    setPresets((p) => ({ ...p, [id]: { ...jobType(id).defaultPreset, ...p[id], [f]: v } }));

  const finish = () => {
    const filled: Presets = {};
    for (const id of specialties) filled[id] = { ...jobType(id).defaultPreset, ...presets[id] };
    savePresets({ ...hadPresets, ...filled });
    markFreshSetup();
    saveProfile({
      ...had,
      companyName: companyName.trim(), contactName: contactName.trim(), phone: phone.trim(), email: email.trim(),
      license: license.trim(), specialties: [...specialties, 'small'], markupPct, minMarkupPct, salesTaxPct,
      quoteValidDays: had?.quoteValidDays ?? 30, quoteLanguage: had?.quoteLanguage ?? 'en', schedule: had?.schedule ?? DEFAULT_SCHEDULE, about: about.trim(), work,
      tipsOk: tips || undefined, tipsAt: tips ? (had?.tipsAt ?? new Date().toISOString()) : undefined,
    });
    onDone?.();
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
                disabled={step !== 1 && specialties.length === 0}
                onPress={() => { if (step === 1 && !companyName.trim()) { setTried1(true); return; } setStep(step + 1); }}
              />
            ) : (
              <Button title={review ? 'Looks good' : 'Start estimating'} style={{ flex: 2 }} onPress={finish} />
            )}
          </View>
        }>
        <Muted>Step {step} of 4</Muted>
        <Progress value={step / 4} height={6} />

        {step === 1 && (
          <>
            <Reveal style={{ alignItems: 'center', gap: 4, marginTop: 4 }}>
              <Art name="hero" width={260} />
              <Text style={{ color: C.accent, fontWeight: '800', fontSize: 15, letterSpacing: 0.5 }}>{review ? 'WELCOME BACK' : 'WELCOME TO BIDWELL AI'}</Text>
              <Muted style={{ textAlign: 'center' }}>{review
                ? 'Your setup came back from your account. Walk through the 4 steps to check it; change anything that’s different.'
                : 'Faster estimates, organized job sites and happy clients. Two minutes to set up.'}</Muted>
            </Reveal>
            <H1>Your company</H1>
            <Banner tone="info" title="This information is printed on your quotes">
              Your company name, your name, phone, email and registration number appear at the top of every quote, contract and PDF you send to clients. Use the details you want clients to see. You can change them any time in Settings.
            </Banner>
            <Field label="Company name *" value={companyName} onChangeText={setCompanyName} placeholder="e.g. Smith Remodeling LLC" error={tried1 && !companyName.trim() ? 'Company name is required' : null} />
            <Field label="Your name" value={contactName} onChangeText={setContactName} />
            <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
            <Field label="Contractor registration #" value={license} onChangeText={setLicense} autoCapitalize="characters"
              help="Washington requires it on bids and contracts." />
            <Tick on={tips} onPress={() => setTips((v) => !v)}>
              Optional: send me setup tips and Bidwell news by text or email. I can reply STOP or turn this off any time. Not needed to use the app.
            </Tick>
            {review ? null : <RestoreBackup />}
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
            <Muted>A few questions so Bidwell learns how you work. It reads your answers with every job. Skip anything; change it anytime in Settings.</Muted>
            <WorkProfileForm value={work} onChange={setWork} />
            <Field label="Anything else Bidwell should know? (optional)" multiline value={about} onChangeText={setAbout} maxLength={2000}
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
