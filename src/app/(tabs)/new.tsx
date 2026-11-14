import { lessonsContext } from '@/engine/books';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, View } from 'react-native';

import { Text } from '@/ui/text';
import { demoAI, guessJobType, pickJobType, type ImageInput, type ScopeResult } from '@/engine/ai';
import { historyPerSf } from '@/engine/estimator';
import { rate } from '@/engine/format';
import { answersFromPlan, planTotals } from '@/engine/floorplan';
import { defaultAnswers, isJobTypeId, JOB_TYPES, jobType, perUnit } from '@/engine/jobTypes';
import { INDOOR_NOTE, isIndoorType, suggestFromScan } from '@/engine/recommend';
import { workSummary } from '@/engine/profile';
import type { EstimateMode, JobTypeId } from '@/engine/types';
import { aiLanguage } from '@/i18n';
import { useApp } from '@/store/AppContext';
import { contactsAvailable, pickClient } from '@/ui/contacts';
import { AiWorking, atLeast, workTime, type WorkJob } from '@/ui/AiWorking';
import { Banner, C, Field, Muted, Screen, Select } from '@/ui/kit';
import { Composer } from '@/ui/Composer';
import { QuickPrice } from '@/ui/QuickPrice';
import { notify } from '@/ui/notify';
import { aiFor, inClaudeApp } from '@/ui/host';
import { useCloud } from '@/cloud/CloudProvider';
import { toAiImages } from '@/ui/photos';
import { resolvePhotoUri, savePhoto } from '@/ui/photoStore';

export default function NewEstimate() {
  const { profile, draft, setDraft, apiKey, pastJobs, pendingPlan, setPendingPlan, aiAllowed, lessons, projects } = useApp();
  const cloud = useCloud();
  // The AI is reachable with a Bidwell account, a personal key, or inside the Claude app.
  const claudeOn = aiAllowed && (!!apiKey || inClaudeApp || !!cloud.user);
  const params = useLocalSearchParams<{ type?: string; project?: string }>();
  const [jobTypeId, setJobTypeId] = useState<JobTypeId | null>(params.type && isJobTypeId(params.type) ? params.type : null);
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
  // "Price this job" on a photo-only job: the estimate joins that job, starting with its client and address.
  const [forProject, setForProject] = useState<string | null>(null);
  const [seenProject, setSeenProject] = useState<string | undefined>(undefined);
  if (params.project !== seenProject) {
    setSeenProject(params.project);
    const p = params.project ? projects.find((x) => x.id === params.project && !x.estimateId) : undefined;
    if (p) { setForProject(p.id); setClientName(p.clientName); setAddress(p.address); setTitle(p.title); setKind('describe'); }
  }
  const linked = projects.find((x) => x.id === forProject && !x.estimateId);
  // Start fresh once the estimate that came from this form is built (the draft is gone). Until then the form keeps
  // what was typed, so going back from the questions loses nothing.
  const [handedOff, setHandedOff] = useState(false);
  const skipRef = useRef<(() => void) | null>(null);
  const clearForm = () => {
    setJobTypeId(null); setTitle(''); setClientName(''); setAddress(''); setDescription(''); setPhotos([]);
    setPendingPlan(null); setForProject(null); router.setParams({ project: undefined });
  };
  if (handedOff && !draft) { setHandedOff(false); clearForm(); }

  const mine = profile?.specialties ?? [];
  // After an indoor 3D scan, only indoor work is offered.
  const indoorOnly = !!pendingPlan?.length;
  const suggestions = pendingPlan?.length ? suggestFromScan(pendingPlan) : [];
  const guessedRaw = !jobTypeId && description.length > 10 ? guessJobType(description) : undefined;
  const guessed = guessedRaw && (!indoorOnly || isIndoorType(guessedRaw)) ? guessedRaw : undefined;
  const effectiveType = jobTypeId ?? guessed ?? null;
  const detailedAllowed = effectiveType ? jobType(effectiveType).detailed : true;
  const quickAllowed = effectiveType !== 'small';
  const effectiveMode: EstimateMode = !detailedAllowed ? 'quick' : !quickAllowed ? 'detailed' : mode;

  // One drop-down: what the scan suggests first, then the contractor's own work, then everything else.
  const order = [...suggestions.map((x) => x.jobTypeId), ...mine, ...JOB_TYPES.map((j) => j.id)].filter((id) => id !== 'small');
  const typeOptions = [...new Set<JobTypeId>([...order, 'small'])].filter((id) => !indoorOnly || isIndoorType(id) || id === jobTypeId).map((id) => ({
    value: id, label: jobType(id).name,
    sub: suggestions.find((x) => x.jobTypeId === id)?.why ?? (id === 'small' ? 'Pick single items from your price book' : mine.includes(id) ? 'Your work' : undefined),
  }));

  const addPhotos = async (camera: boolean) => {
    try {
      if (camera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return notify('Camera access needed', 'Allow camera access in Settings to take job photos.');
      }
      const res = camera
        ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.6 });
      if (res.canceled) return;
      // Keep the photos in the app's own folder: the picker's copies are temporary and are never backed up.
      const kept = await Promise.all(res.assets.map((a) => (Platform.OS === 'web' ? a.uri : savePhoto(a.uri, a.width).then((x) => x.uri).catch(() => a.uri))));
      setPhotos((p) => [...p, ...kept].slice(0, 20));
    } catch {
      notify('Photos unavailable', 'Could not open photos on this device.');
    }
  };

  const next = async (type: JobTypeId) => {
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
        `Matching ${jobType(type).name} questions`,
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
      const r = await toAiImages(photos.map(resolvePhotoUri), 8).catch(() => ({ images: [], failed: photos.length }));
      images = r.images;
      skipped = r.failed + Math.max(0, photos.length - 8);
    }
    let parsed: ScopeResult = { answers: {}, heard: [] };
    // Claude gets the contractor's own words about how they work, and what they really charge for this work.
    const h = historyPerSf(type, 'mid', pastJobs);
    const ctx = {
      about: profile?.about,
      work: workSummary(profile?.work),
      history: h.perSf ? `${h.count} past job${h.count === 1 ? '' : 's'}, average ${rate(h.perSf)}${perUnit(jobType(type).unit)}` : undefined,
      scope: pendingPlan?.length && isIndoorType(type) ? INDOOR_NOTE : undefined,
      prices: lessonsContext(lessons ?? []),
      language: aiLanguage(),
    };
    if (description.trim() || images.length > 0) {
      // "Skip" on the waiting screen stops waiting for the AI and reads the notes on the phone instead.
      let gaveUp = false;
      const skip = new Promise<ScopeResult>((resolve) => { skipRef.current = () => { gaveUp = true; resolve(demoAI.parseScope(description, type)); }; });
      parsed = await Promise.race([
        ai.parseScope(description, type, images, ctx)
          .catch((e: unknown) => ({ answers: {}, heard: [], error: e instanceof Error ? e.message : 'Bidwell could not read this job.' })),
        skip,
      ]);
      skipRef.current = null;
      if (gaveUp) skipped = 0;
      else await atLeast(started, ms);
    } else {
      await atLeast(started, ms);
    }
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
      ...(linked ? { projectId: linked.id } : {}),
    });
    // The form stays as typed until the estimate is built: Back from the questions returns to it, nothing lost.
    setHandedOff(true);
    router.push('/questions');
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
  const send = async () => {
    let type = effectiveType;
    // The keyword reader knows English trade words. Anything else (another language, an unusual job) the AI picks.
    if (!type && claudeOn && description.trim().length > 3) {
      setBusy(true);
      const offered = JOB_TYPES.filter((j) => !indoorOnly || isIndoorType(j.id)).map((j) => ({ id: j.id, name: j.name }));
      type = await pickJobType(aiFor(apiKey, aiAllowed), description, offered).catch(() => null);
      setBusy(false);
      if (type) setJobTypeId(type);
    }
    if (!type) { notify('Pick the type of work', 'Choose it under “Type of work”, or describe the job so Bidwell can pick it.'); return; }
    await next(type);
  };

  if (kind === 'quick') {
    return (
      <Screen>
        <KindSwitch kind={kind} onChange={setKind} />
        <QuickPrice key={linked?.id ?? 'new'} initialType={effectiveType} project={linked} />
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
                <Image source={{ uri: resolvePhotoUri(uri) }} style={{ width: 52, height: 52, borderRadius: 10 }} />
                <View style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(11,19,36,0.7)', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="close" size={12} color="#FFFFFF" />
                </View>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
        <Composer value={description} onChange={setDescription} onSend={send} sending={busy} sendLabel="Continue" inputLabel="Describe the job" allowEmpty
          placeholder={effectiveType ? `Describe the job: ${jobType(effectiveType).name}…` : 'Describe the job…'}
          actions={[
            { icon: 'camera', label: 'Take photos', sub: 'Bidwell looks for sizes, conditions and code issues', onPress: () => addPhotos(true) },
            { icon: 'images', label: 'Choose photos', onPress: () => addPhotos(false) },
            { icon: 'scan', label: 'Scan rooms in 3D', sub: 'Measures walls, doors and windows', onPress: () => router.push('/scan') },
            ...(contactsAvailable ? [{ icon: 'person-add' as const, label: 'Client from Contacts', onPress: pickContact }] : []),
          ]} />
      </View>
    }>
      <AiWorking job={working} onSkip={() => skipRef.current?.()} />
      <KindSwitch kind={kind} onChange={setKind} />
      {pendingPlan?.length ? (
        <Banner tone="ok" title={`Floor plan ready: ${pendingPlan.length} room${pendingPlan.length > 1 ? 's' : ''}, ${planTotals(pendingPlan).floorSf} SF`}>
          It’s added to this estimate and fills in the areas. <Text style={{ fontWeight: '700', textDecorationLine: 'underline' }} onPress={() => setPendingPlan(null)}>Remove</Text>
        </Banner>
      ) : null}

      {linked ? (
        <Banner tone="info" title={`Pricing “${linked.title}”`}>
          The estimate joins this job, with the photos already taken. <Text style={{ fontWeight: '700', textDecorationLine: 'underline' }} onPress={clearForm}>Remove</Text>
        </Banner>
      ) : null}
      <View style={{ gap: 4 }}>
        <Text style={{ color: C.ink, fontSize: 22, fontWeight: '700', letterSpacing: -0.3 }}>What’s the job?</Text>
        <Muted>Say it like you would to a helper: the rooms, the sizes, what’s changing. Tap + to add photos or scan the rooms.</Muted>
      </View>

      <Select<JobTypeId> label="Type of work" value={effectiveType} onChange={setJobTypeId} placeholder="Bidwell picks it from what you say"
        options={typeOptions}
        help={guessed && !jobTypeId ? `Picked from your description. Tap to change.` : undefined} />
      <Field label="Client" value={clientName} onChangeText={setClientName} placeholder="Name (optional)" />
      <Field label="Job address" value={address} onChangeText={setAddress} placeholder="Street, city (optional)" />
      <Muted style={{ fontSize: 12 }}>Your notes stay private. Only the quote you approve goes to the client.</Muted>
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
