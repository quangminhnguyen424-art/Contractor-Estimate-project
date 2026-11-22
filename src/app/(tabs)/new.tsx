import { lessonsContext } from '@/engine/books';
import { learnedContext, learnFromQuotes, learnFromWork, taughtContext } from '@/engine/learned';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, View } from 'react-native';

import { Text } from '@/ui/text';
import { guessJobType, pickJobType, type ImageInput } from '@/engine/ai';
import { historyPerSf } from '@/engine/estimator';
import { rate } from '@/engine/format';
import { planTotals } from '@/engine/floorplan';
import { isJobTypeId, JOB_TYPES, jobType, perUnit } from '@/engine/jobTypes';
import { NeedSizeError, type PlanResult } from '@/engine/workPlan';
import { INDOOR_NOTE, isIndoorType, suggestFromScan } from '@/engine/recommend';
import { workSummary } from '@/engine/profile';
import type { JobTypeId } from '@/engine/types';
import { aiLanguage, docLang } from '@/i18n';
import { useApp } from '@/store/AppContext';
import { contactsAvailable, pickClient } from '@/ui/contacts';
import { AiWorking, atLeast, type WorkJob } from '@/ui/AiWorking';
import { Banner, C, Field, Muted, NumberField, Screen, Segmented, Select } from '@/ui/kit';
import { RoofSatellite } from '@/ui/RoofSatellite';
import { Composer } from '@/ui/Composer';
import { QuickPrice } from '@/ui/QuickPrice';
import { notify, notifySettings } from '@/ui/notify';
import { aiFor, inClaudeApp } from '@/ui/host';
import { useCloud } from '@/cloud/CloudProvider';
import { toAiImages } from '@/ui/photos';
import { resolvePhotoUri, savePhoto } from '@/ui/photoStore';

export default function NewEstimate() {
  const { profile, draft, setDraft, apiKey, pastJobs, pendingPlan, setPendingPlan, aiAllowed, lessons, projects, estimates, priceBook } = useApp();
  const cloud = useCloud();
  // The AI is reachable with a Studwise account, a personal key, or inside the Claude app.
  const claudeOn = aiAllowed && (!!apiKey || inClaudeApp || !!cloud.user);
  const params = useLocalSearchParams<{ type?: string; project?: string; lead?: string; client?: string; address?: string; note?: string }>();
  const [jobTypeId, setJobTypeId] = useState<JobTypeId | null>(params.type && isJobTypeId(params.type) ? params.type : null);
  // Coming from a Studwise suggestion on the scan screen picks that type (also when this tab was already open).
  const [lastParam, setLastParam] = useState(params.type);
  if (params.type !== lastParam) {
    setLastParam(params.type);
    if (params.type && isJobTypeId(params.type)) setJobTypeId(params.type);
  }
  const [title, setTitle] = useState('');
  // The one number Studwise never guesses: the job's main size. Everything else it works out for the job.
  const [size, setSize] = useState(0);
  const [measured, setMeasured] = useState('');
  const [failed, setFailed] = useState<string | null>(null);
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
  // "Start an estimate" on an ADU lead: its client, address and what they wrote fill the form.
  const [seenLead, setSeenLead] = useState<string | undefined>(undefined);
  if (params.lead !== seenLead) {
    setSeenLead(params.lead);
    if (params.lead) {
      setClientName(params.client ?? ''); setAddress(params.address ?? ''); setDescription(params.note ?? ''); setKind('describe');
      setTitle(params.client ? `${params.client} — ADU` : '');
    }
  }
  const linked = projects.find((x) => x.id === forProject && !x.estimateId);
  // Start fresh once the estimate that came from this form is built (the draft is gone). Until then the form keeps
  // what was typed, so going back from the questions loses nothing.
  const [handedOff, setHandedOff] = useState(false);
  const skipRef = useRef<(() => void) | null>(null);
  const clearForm = () => {
    setJobTypeId(null); setTitle(''); setClientName(''); setAddress(''); setDescription(''); setPhotos([]); setSize(0); setMeasured(''); setFailed(null);
    setPendingPlan(null); setForProject(null); router.setParams({ project: undefined, lead: undefined, client: undefined, address: undefined, note: undefined });
  };
  if (handedOff && !draft) { setHandedOff(false); clearForm(); }

  const mine = profile?.specialties ?? [];
  // After an indoor 3D scan, only indoor work is offered.
  const indoorOnly = !!pendingPlan?.length;
  const suggestions = pendingPlan?.length ? suggestFromScan(pendingPlan) : [];
  const guessedRaw = !jobTypeId && description.length > 10 ? guessJobType(description) : undefined;
  const guessed = guessedRaw && (!indoorOnly || isIndoorType(guessedRaw)) ? guessedRaw : undefined;
  const effectiveType = jobTypeId ?? guessed ?? null;
  const unit = effectiveType && effectiveType !== 'small' ? jobType(effectiveType).unit : 'SF';
  const needsSize = effectiveType !== 'small' && unit !== 'JOB';
  // A 3D scan measures the floor: that is the size of work priced per square foot.
  const scanSf = pendingPlan?.length ? Math.round(planTotals(pendingPlan).floorSf) : 0;

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
        if (!perm.granted) return notifySettings('Camera access needed', 'Allow camera access in Settings to take job photos.');
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

  /** Opens the work list for this job: what Studwise planned, or an empty list to fill in by hand. */
  const openWork = (type: JobTypeId, plan: PlanResult | null, sizeNow: number) => {
    const jt = jobType(type);
    const own = Object.fromEntries(jt.questions.filter((q) => q.custom).map((q) => [q.id, q.default]));
    const mainSize = sizeNow > 0 ? sizeNow : plan?.size ?? 0;
    setDraft({
      jobTypeId: type,
      mode: 'detailed',
      title: title.trim() || `${clientName.trim() ? `${clientName.trim()} — ` : ''}${jt.name}`,
      clientName, address, description, scopeNote: '', photos,
      finish: profile?.work?.finish ?? 'mid',
      answers: { ...own, ...(plan?.answers as Record<string, number | string | boolean> | undefined), ...(mainSize > 0 ? { sizeSf: mainSize } : {}) },
      customItems: [],
      work: plan?.work ?? [],
      ...(plan ? { workAi: plan.work } : {}),
      heard: [],
      ...(pendingPlan?.length ? { plan: pendingPlan } : {}),
      aiNotes: plan?.notes ?? [],
      ...(linked ? { projectId: linked.id } : {}),
    });
    // The form stays as typed until the estimate is built: Back from the work list returns to it, nothing lost.
    setHandedOff(true);
    setFailed(null);
    router.push('/work');
  };

  const next = async (type: JobTypeId) => {
    const jt = jobType(type);
    const sizeNow = size > 0 ? size : jt.unit === 'SF' ? scanSf : 0;
    // AI off (no account, or sharing not allowed): the contractor writes the list.
    if (!claudeOn) return openWork(type, null, sizeNow);
    if (type !== 'small' && jt.unit !== 'JOB' && !(sizeNow > 0) && !/\d/.test(description)) {
      return notify('Add the size of the job', 'Studwise works out the work for each job, but it never guesses a measurement. Type the size, or say it in your description.');
    }
    setBusy(true);
    setFailed(null);
    const sent = Math.min(8, photos.length);
    // Planning a job takes the AI a while: the steps tick off over about that long, then it waits for the answer.
    const ms = Math.min(32000, 20000 + sent * 1500);
    setWorking({
      title: 'Planning this job',
      steps: [
        description.trim() ? 'Reading your notes' : 'Starting from the type of work and size',
        ...(sent ? [`Looking at ${sent} photo${sent > 1 ? 's' : ''}`] : []),
        ...(pendingPlan?.length ? [`3D scan: ${pendingPlan.length} room${pendingPlan.length > 1 ? 's' : ''}, ${Math.round(planTotals(pendingPlan).floorSf)} SF floor`] : []),
        'Working out what this job needs',
        'Writing the work, stage by stage',
        'Measuring quantities',
        'Pricing from your price book',
      ],
      ms,
    });
    const started = Date.now();
    const ai = aiFor(apiKey, aiAllowed);
    let images: ImageInput[] = [];
    let skipped = 0;
    if (photos.length > 0) {
      const r = await toAiImages(photos.map(resolvePhotoUri), 8).catch(() => ({ images: [], failed: photos.length }));
      images = r.images;
      skipped = r.failed + Math.max(0, photos.length - 8);
    }
    // Claude gets the contractor's own words about how they work, and what they really charge for this work.
    const h = historyPerSf(type, 'mid', pastJobs);
    const ctx = {
      about: profile?.about,
      work: workSummary(profile?.work),
      history: h.perSf ? `${h.count} past job${h.count === 1 ? '' : 's'}, average ${rate(h.perSf)}${perUnit(jt.unit)}` : undefined,
      scope: pendingPlan?.length && isIndoorType(type) ? INDOOR_NOTE : undefined,
      prices: lessonsContext(lessons ?? []),
      // How they word and price quotes, and how they corrected Studwise's earlier work lists for this type of work.
      learned: [learnedContext(learnFromQuotes(estimates, profile?.quoteLanguage ?? 'en')), taughtContext(learnFromWork(estimates), type)].filter(Boolean).join('\n\n'),
      language: aiLanguage(),
    };
    const t = pendingPlan?.length ? planTotals(pendingPlan) : null;
    const scan = t ? `3D scan of ${pendingPlan!.length} room${pendingPlan!.length > 1 ? 's' : ''}: floor ${Math.round(t.floorSf)} SF, walls ${Math.round(t.wallSf)} SF, ceiling ${Math.round(t.ceilingSf)} SF, baseboard ${Math.round(t.baseboardLf)} LF, ${t.doors} doors, ${t.windows} windows.` : '';
    // "Skip" on the waiting screen stops waiting for the AI: the contractor writes the list.
    let gaveUp = false;
    const skip = new Promise<'skip'>((resolve) => { skipRef.current = () => { gaveUp = true; resolve('skip'); }; });
    const result = await Promise.race([
      ai.planJob({
        jobTypeId: type, text: description, size: sizeNow > 0 ? sizeNow : undefined, finish: profile?.work?.finish ?? 'mid',
        measured: [scan, measured].filter(Boolean).join(' '), priceBook, markupPct: profile?.markupPct ?? 20,
        wantVi: docLang() === 'vi' || profile?.quoteLanguage === 'vi',
      }, images, ctx).catch((e: unknown) => (e instanceof Error ? e : new Error('Studwise could not plan this job.'))),
      skip,
    ]);
    skipRef.current = null;
    if (!gaveUp && !(result instanceof Error)) await atLeast(started, 2500);
    setWorking(null);
    setBusy(false);
    if (result === 'skip') return openWork(type, null, sizeNow);
    if (result instanceof NeedSizeError) {
      return notify('Studwise needs a measurement', `${result.message}\n\nType the size, then tap Continue again.`);
    }
    if (result instanceof Error) {
      // No template stands in for the AI: say what went wrong and let them try again or write the list.
      setFailed(result.message);
      return;
    }
    if (skipped > 0) notify(`${skipped} photo${skipped > 1 ? 's were' : ' was'} not sent to Studwise`, photos.length > 8 ? 'Studwise looks at up to 8 photos per estimate, and some photos could not be read.' : 'Some photos could not be read (for example HEIC files on a computer). Try JPG or PNG.');
    openWork(type, result, sizeNow);
  };

  const pickContact = async () => {
    try {
      const c = await pickClient();
      if (!c) return;
      if (c.name) setClientName(c.name);
      if (c.address && !address.trim()) setAddress(c.address);
    } catch {
      notifySettings('Contacts unavailable', 'Allow Studwise AI to use Contacts in your phone’s Settings, or type the name.');
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
    if (!type) { notify('Pick the type of work', 'Choose it under “Type of work”, or describe the job so Studwise can pick it.'); return; }
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
            { icon: 'camera', label: 'Take photos', sub: 'Studwise looks for sizes, conditions and code issues', onPress: () => addPhotos(true) },
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
      {failed ? (
        <Banner tone="warn" title="Studwise could not plan this job">
          <Text raw>{`${failed}\n`}</Text>Tap Continue to try again, or{' '}
          <Text style={{ fontWeight: '700', textDecorationLine: 'underline' }} onPress={() => { if (effectiveType) openWork(effectiveType, null, size > 0 ? size : unit === 'SF' ? scanSf : 0); else notify('Pick the type of work', 'Choose it under “Type of work” first.'); }}>write the work list yourself</Text>.
        </Banner>
      ) : null}
      <View style={{ gap: 4 }}>
        <Text style={{ color: C.ink, fontSize: 24, fontWeight: '700', letterSpacing: -0.4 }}>What’s the job?</Text>
        <Muted>Say or type it below: the rooms, what’s there now, what’s changing. Studwise works out the work for this job.</Muted>
      </View>

      <Select<JobTypeId> label="Type of work" value={effectiveType} onChange={setJobTypeId} placeholder="Studwise picks it from what you say"
        options={typeOptions}
        help={guessed && !jobTypeId ? `Picked from your description. Tap to change.` : undefined} />
      {needsSize ? (
        <NumberField label="Size of the job" suffix={unit === 'EA' ? 'items' : unit} value={size > 0 ? size : unit === 'SF' ? scanSf : 0} onChange={setSize}
          help={scanSf > 0 && unit === 'SF' && !(size > 0) ? 'From your 3D scan. Change it if the job is a different size.' : 'The one number Studwise never guesses. Leave it empty if you say the size in your description.'} />
      ) : null}
      {effectiveType === 'roofing' ? (
        <RoofSatellite address={address} onUse={(answers, summary, addr) => {
          setSize(Number(answers.sizeSf) || 0);
          setMeasured(`Measured from satellite: ${summary}`);
          if (!address.trim()) setAddress(addr);
        }} />
      ) : null}
      <Field label="Client" value={clientName} onChangeText={setClientName} placeholder="Name (optional)" />
      <Field label="Job address" value={address} onChangeText={setAddress} placeholder="Street, city (optional)" />
    </Screen>
  );
}

/** Two ways to price: describe the job (AI, photos, scan) or a quick price per unit for repeat work. */
function KindSwitch({ kind, onChange }: { kind: 'describe' | 'quick'; onChange: (k: 'describe' | 'quick') => void }) {
  return (
    <Segmented<'describe' | 'quick'> value={kind} onChange={onChange}
      options={[{ value: 'describe', label: 'Describe the job' }, { value: 'quick', label: 'Quick price' }]} />
  );
}
