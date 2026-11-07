import { lessonsContext } from '@/engine/books';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';

import { Text } from '@/ui/text';
import { guessJobType, type ImageInput, type ScopeResult } from '@/engine/ai';
import { historyPerSf } from '@/engine/estimator';
import { money } from '@/engine/format';
import { answersFromPlan, planTotals } from '@/engine/floorplan';
import { defaultAnswers, isJobTypeId, JOB_TYPES, jobType, perUnit } from '@/engine/jobTypes';
import { INDOOR_NOTE, isIndoorType, suggestFromScan } from '@/engine/recommend';
import { workSummary } from '@/engine/profile';
import type { EstimateMode, JobTypeId } from '@/engine/types';
import { useApp } from '@/store/AppContext';
import { contactsAvailable, pickClient } from '@/ui/contacts';
import { AiWorking, atLeast, workTime, type WorkJob } from '@/ui/AiWorking';
import { JobTypeChips } from '@/ui/JobTypes';
import { Banner, C, Chip, Field, Label, Muted, Screen } from '@/ui/kit';
import { Composer } from '@/ui/Composer';
import { QuickPrice } from '@/ui/QuickPrice';
import { notify } from '@/ui/notify';
import { aiFor, inClaudeApp } from '@/ui/host';
import { toAiImages } from '@/ui/photos';

export default function NewEstimate() {
  const { profile, setDraft, apiKey, pastJobs, pendingPlan, setPendingPlan, aiAllowed, lessons } = useApp();
  const claudeOn = aiAllowed && (!!apiKey || inClaudeApp);
  const [showAll, setShowAll] = useState(false);
  const params = useLocalSearchParams<{ type?: string }>();
  const [jobTypeId, setJobTypeId] = useState<JobTypeId | null>(params.type && isJobTypeId(params.type) ? params.type : null);
  const [allowOutdoor, setAllowOutdoor] = useState(false);
  // Coming from a Bidwell suggestion on the scan screen picks that type (also when this tab was already open).
  const [lastParam, setLastParam] = useState(params.type);
  if (params.type !== lastParam) {
    setLastParam(params.type);
    if (params.type && isJobTypeId(params.type)) setJobTypeId(params.type);
  }
  const mode: EstimateMode = 'detailed';
  const [title, setTitle] = useState('');
  const [clientName, setClientName] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [working, setWorking] = useState<WorkJob | null>(null);
  const [kind, setKind] = useState<'describe' | 'quick'>('describe');

  const mine = profile?.specialties ?? [];
  // After an indoor 3D scan, only indoor work is offered (outdoor work can be shown on purpose).
  const indoorOnly = !!pendingPlan?.length && !allowOutdoor;
  const suggestions = pendingPlan?.length ? suggestFromScan(pendingPlan) : [];
  const guessedRaw = !jobTypeId && description.length > 10 ? guessJobType(description) : undefined;
  const guessed = guessedRaw && (!indoorOnly || isIndoorType(guessedRaw)) ? guessedRaw : undefined;
  const effectiveType = jobTypeId ?? guessed ?? null;
  const detailedAllowed = effectiveType ? jobType(effectiveType).detailed : true;
  const quickAllowed = effectiveType !== 'small';
  const effectiveMode: EstimateMode = !detailedAllowed ? 'quick' : !quickAllowed ? 'detailed' : mode;

  const addPhotos = async (camera: boolean) => {
    try {
      if (camera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return notify('Camera access needed', 'Allow camera access in Settings to take job photos.');
      }
      const res = camera
        ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.6 });
      if (!res.canceled) setPhotos((p) => [...p, ...res.assets.map((a) => a.uri)].slice(0, 20));
    } catch {
      notify('Photos unavailable', 'Could not open photos on this device.');
    }
  };

  const next = async () => {
    const type = effectiveType;
    if (!type) return;
    setBusy(true);
    // Show Claude at work: 3–8 s depending on how much there is to read.
    const sent = claudeOn ? Math.min(8, photos.length) : 0;
    const ms = workTime(sent * 650 + Math.min(2000, description.length * 5) + (pendingPlan?.length ?? 0) * 400);
    setWorking({
      title: 'Reading the job',
      steps: [
        description.trim() ? 'Reading your notes' : 'Starting from your job type',
        ...(sent ? [`Looking at ${sent} photo${sent > 1 ? 's' : ''}`] : []),
        ...(pendingPlan?.length ? [`3D scan: ${pendingPlan.length} room${pendingPlan.length > 1 ? 's' : ''}, ${Math.round(planTotals(pendingPlan).floorSf)} SF floor`,
          ...(isIndoorType(type) ? ['Indoor only: skipping roof, siding and yard work'] : [])] : []),
        `Matching ${jobType(type).name.toLowerCase()} questions`,
        'Filling in sizes and counts',
        'Checking your past jobs',
      ],
      ms,
    });
    const started = Date.now();
    const ai = aiFor(apiKey, aiAllowed);
    // Claude also looks at the photos; the offline demo only reads the text.
    let images: ImageInput[] = [];
    let skipped = 0;
    if (claudeOn && photos.length > 0) {
      const r = await toAiImages(photos, 8).catch(() => ({ images: [], failed: photos.length }));
      images = r.images;
      skipped = r.failed + Math.max(0, photos.length - 8);
    }
    let parsed: ScopeResult = { answers: {}, heard: [] };
    // Claude gets the contractor's own words about how they work, and what they really charge for this work.
    const h = historyPerSf(type, 'mid', pastJobs);
    const ctx = {
      about: profile?.about,
      work: workSummary(profile?.work),
      history: h.perSf ? `${h.count} past job${h.count === 1 ? '' : 's'}, average ${money(h.perSf)}${perUnit(jobType(type).unit)}` : undefined,
      scope: pendingPlan?.length && isIndoorType(type) ? INDOOR_NOTE : undefined,
      prices: lessonsContext(lessons ?? []),
    };
    if (description.trim() || images.length > 0) {
      parsed = await ai.parseScope(description, type, images, ctx)
        .catch((e: unknown) => ({ answers: {}, heard: [], error: e instanceof Error ? e.message : 'Bidwell could not read this job.' }));
    }
    await atLeast(started, ms);
    setWorking(null);
    setBusy(false);
    if (parsed.error) notify('Bidwell could not read this job', `${parsed.error}\n\nUsed the offline reader instead.`);
    else if (skipped > 0) notify(`${skipped} photo${skipped > 1 ? 's were' : ' was'} not sent to Bidwell`, photos.length > 8 ? 'Bidwell looks at up to 8 photos per estimate, and some photos could not be read.' : 'Some photos could not be read (for example HEIC files on a computer). Try JPG or PNG.');
    const jt = jobType(type);
    // Rooms from the 3D scan screen fill in the areas (floor, walls, baseboard) for this type of work.
    const fromPlan = pendingPlan?.length ? answersFromPlan(jt, pendingPlan) : null;
    setDraft({
      jobTypeId: type,
      mode: effectiveMode,
      title: title.trim() || `${clientName.trim() ? `${clientName.trim()} — ` : ''}${jt.name}`,
      clientName, address, description, scopeNote: '', photos,
      finish: profile?.work?.finish ?? 'mid',
      answers: { ...defaultAnswers(type), ...parsed.answers, ...(fromPlan?.answers ?? {}) },
      customItems: [],
      heard: [...(fromPlan?.heard ?? []), ...parsed.heard],
      ...(pendingPlan?.length ? { plan: pendingPlan } : {}),
      aiNotes: parsed.notes ?? [],
      aiFilled: parsed.sources ?? Object.fromEntries(Object.keys(parsed.answers).map((k) => [k, 'notes' as const])),
    });
    router.push('/questions');
    // Clear the form so the next estimate starts fresh (the draft keeps everything).
    setJobTypeId(null); setTitle(''); setClientName(''); setAddress(''); setDescription(''); setPhotos([]);
    setPendingPlan(null);
  };

  const pickContact = async () => {
    try {
      const c = await pickClient();
      if (!c) return;
      if (c.name) setClientName(c.name);
      if (c.address && !address.trim()) setAddress(c.address);
    } catch {
      notify('Contacts unavailable', 'Allow Bidwell AI to use Contacts in your iPhone Settings, or type the name.');
    }
  };
  const send = () => {
    if (!effectiveType) { notify('Pick the type of work', 'Tap one of the job types above, or describe the job so Bidwell can pick it.'); return; }
    next();
  };

  if (kind === 'quick') {
    return (
      <Screen>
        <KindSwitch kind={kind} onChange={setKind} />
        <QuickPrice initialType={effectiveType} />
      </Screen>
    );
  }

  return (
    <Screen footer={
      <View style={{ gap: 8 }}>
        {photos.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {photos.map((uri) => (
              <Pressable key={uri} accessibilityLabel="Remove photo" onPress={() => setPhotos((p) => p.filter((x) => x !== uri))}>
                <Image source={{ uri }} style={{ width: 52, height: 52, borderRadius: 10 }} />
                <View style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(11,19,36,0.7)', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="close" size={12} color="#FFFFFF" />
                </View>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
        <Composer value={description} onChange={setDescription} onSend={send} sending={busy} sendLabel="Continue"
          placeholder={effectiveType ? `Describe the ${jobType(effectiveType).name.toLowerCase()}…` : 'Describe the job, or talk…'}
          actions={[
            { icon: 'camera', label: 'Take photos', sub: 'Bidwell looks for sizes, conditions and code issues', onPress: () => addPhotos(true) },
            { icon: 'images', label: 'Choose photos', onPress: () => addPhotos(false) },
            { icon: 'scan', label: 'Scan rooms in 3D', sub: 'Measures walls, doors and windows', onPress: () => router.push('/scan') },
            ...(contactsAvailable ? [{ icon: 'person-add' as const, label: 'Client from Contacts', onPress: pickContact }] : []),
          ]} />
      </View>
    }>
      <AiWorking job={working} />
      <KindSwitch kind={kind} onChange={setKind} />
      {pendingPlan?.length ? (
        <Banner tone="ok" title={`Floor plan ready: ${pendingPlan.length} room${pendingPlan.length > 1 ? 's' : ''}, ${planTotals(pendingPlan).floorSf} SF`}>
          It’s added to this estimate and fills in the areas. <Text style={{ fontWeight: '700', textDecorationLine: 'underline' }} onPress={() => setPendingPlan(null)}>Remove</Text>
        </Banner>
      ) : null}
      <Label>Type of work</Label>
      {suggestions.length ? (
        <View style={{ backgroundColor: C.infoBg, borderRadius: 16, padding: 12, gap: 6 }}>
          <Text style={{ color: C.accentDark, fontWeight: '700' }}>Suggested from your scan</Text>
          {suggestions.map((sg) => (
            <Pressable key={sg.jobTypeId} accessibilityRole="button" onPress={() => setJobTypeId(sg.jobTypeId)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
              <Ionicons name={effectiveType === sg.jobTypeId ? 'radio-button-on' : 'radio-button-off'} size={20} color={C.accent} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.ink, fontWeight: '700', fontSize: 15 }}>{jobType(sg.jobTypeId).name}</Text>
                <Text style={{ color: C.muted, fontSize: 13 }}>{sg.why}</Text>
              </View>
            </Pressable>
          ))}
          <Text style={{ color: C.accent, fontWeight: '600', fontSize: 13 }} onPress={() => setAllowOutdoor(!allowOutdoor)}>{allowOutdoor ? 'Hide outdoor work' : 'Show outdoor work too'}</Text>
        </View>
      ) : null}
      <JobTypeChips selected={effectiveType ? [effectiveType] : []} onToggle={(id) => setJobTypeId(id)}
        only={(showAll ? JOB_TYPES.map((j) => j.id) : [...mine, ...(effectiveType && !mine.includes(effectiveType) ? [effectiveType] : [])])
          .filter((id) => !indoorOnly || isIndoorType(id))} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Chip label={showAll ? 'Show mine only' : 'All types of work…'} onPress={() => setShowAll(!showAll)} />
        <Chip label="Small job / repairs" selected={effectiveType === 'small'} onPress={() => setJobTypeId('small')} />
      </View>
      {guessed && !jobTypeId ? <Muted style={{ fontSize: 13 }}>Picked {jobType(guessed).name} from your description. Tap another to change.</Muted> : null}

      <Field label="Client name" value={clientName} onChangeText={setClientName} placeholder="Optional" />
      <Field label="Job address" value={address} onChangeText={setAddress} placeholder="Optional" />

      <View style={{ backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 14, gap: 6 }}>
        <Text style={{ color: C.ink, fontWeight: '700' }}>How it works</Text>
        <Text style={{ color: C.ink2, fontSize: 14, lineHeight: 20 }}>
          Type or tap the microphone and describe the job like you would to a helper: rooms, sizes, what’s changing. Tap + to add photos or scan the rooms. Then tap the arrow: Bidwell fills in the quantities with your prices.
        </Text>
        <Text style={{ color: C.muted, fontSize: 12 }}>Your notes stay private and never go on the client’s quote.</Text>
      </View>
    </Screen>
  );
}

/** Two ways to price: describe the job (AI, photos, scan) or a quick price per unit for repeat work. */
function KindSwitch({ kind, onChange }: { kind: 'describe' | 'quick'; onChange: (k: 'describe' | 'quick') => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <KindItem k="describe" kind={kind} onChange={onChange} icon="sparkles" title="Describe the job" sub="Talk, photos or scan. Bidwell builds it." />
      <KindItem k="quick" kind={kind} onChange={onChange} icon="flash" title="Quick price" sub="Size × your price. Repeat jobs in 30 s." />
    </View>
  );
}

function KindItem({ k, kind, onChange, icon, title, sub }: {
  k: 'describe' | 'quick'; kind: 'describe' | 'quick'; onChange: (k: 'describe' | 'quick') => void; icon: 'sparkles' | 'flash'; title: string; sub: string;
}) {
  const on = kind === k;
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(k)}
      style={{ flex: 1, borderRadius: 18, padding: 12, gap: 4, borderWidth: on ? 2 : 1, borderColor: on ? C.accent : C.line, backgroundColor: on ? C.accentTint : C.card }}>
      <Ionicons name={icon} size={20} color={on ? C.accent : C.ink2} />
      <Text style={{ color: C.ink, fontWeight: '700', fontSize: 15 }}>{title}</Text>
      <Text style={{ color: C.muted, fontSize: 12 }}>{sub}</Text>
    </Pressable>
  );
}
