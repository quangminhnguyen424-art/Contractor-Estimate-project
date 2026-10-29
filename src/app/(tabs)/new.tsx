import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Platform, Pressable, Text, View } from 'react-native';

import { guessJobType, type ImageInput, type ScopeResult } from '@/engine/ai';
import { historyPerSf } from '@/engine/estimator';
import { money } from '@/engine/format';
import { defaultAnswers, jobType, perUnit } from '@/engine/jobTypes';
import type { EstimateMode, JobTypeId } from '@/engine/types';
import { useApp } from '@/store/AppContext';
import { JobTypeChips } from '@/ui/JobTypes';
import { Banner, Button, C, Chip, Field, H2, Label, Muted, Screen, Segmented } from '@/ui/kit';
import { notify } from '@/ui/notify';
import { aiFor, inClaudeApp } from '@/ui/host';
import { toAiImages } from '@/ui/photos';

export default function NewEstimate() {
  const { profile, setDraft, apiKey, pastJobs } = useApp();
  const claudeOn = !!apiKey || inClaudeApp;
  const [showAll, setShowAll] = useState(false);
  const [jobTypeId, setJobTypeId] = useState<JobTypeId | null>(null);
  const [mode, setMode] = useState<EstimateMode>('detailed');
  const [title, setTitle] = useState('');
  const [clientName, setClientName] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const mine = profile?.specialties ?? [];
  const guessed = !jobTypeId && description.length > 10 ? guessJobType(description) : undefined;
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
    const ai = aiFor(apiKey);
    // Claude also looks at the photos; the offline demo only reads the text.
    let images: ImageInput[] = [];
    let skipped = 0;
    if (claudeOn && photos.length > 0) {
      const r = await toAiImages(photos, 8);
      images = r.images;
      skipped = r.failed + Math.max(0, photos.length - 8);
    }
    let parsed: ScopeResult = { answers: {}, heard: [] };
    // Claude gets the contractor's own words about how they work, and what they really charge for this work.
    const h = historyPerSf(type, 'mid', pastJobs);
    const ctx = {
      about: profile?.about,
      history: h.perSf ? `${h.count} past job${h.count === 1 ? '' : 's'}, average ${money(h.perSf)}${perUnit(jobType(type).unit)}` : undefined,
    };
    if (description.trim() || images.length > 0) parsed = await ai.parseScope(description, type, images, ctx);
    setBusy(false);
    if (parsed.error) notify('Claude could not read this job', `${parsed.error}\n\nUsed the offline reader instead.`);
    else if (skipped > 0) notify(`${skipped} photo${skipped > 1 ? 's were' : ' was'} not sent to Claude`, photos.length > 8 ? 'Claude looks at up to 8 photos per estimate, and some photos could not be read.' : 'Some photos could not be read (for example HEIC files on a computer). Try JPG or PNG.');
    const jt = jobType(type);
    setDraft({
      jobTypeId: type,
      mode: effectiveMode,
      title: title.trim() || `${clientName.trim() ? `${clientName.trim()} — ` : ''}${jt.name}`,
      clientName, address, description, scopeNote: '', photos,
      finish: 'mid',
      answers: { ...defaultAnswers(type), ...parsed.answers },
      customItems: [],
      heard: parsed.heard,
      aiNotes: parsed.notes ?? [],
    });
    router.push('/questions');
    // Clear the form so the next estimate starts fresh (the draft keeps everything).
    setJobTypeId(null); setTitle(''); setClientName(''); setAddress(''); setDescription(''); setPhotos([]);
  };

  return (
    <Screen footer={<Button title={busy ? (claudeOn ? 'Claude is reading your notes and photos…' : 'Reading your notes…') : 'Continue'} disabled={!effectiveType || busy} onPress={next} />}>
      <Label>Project type</Label>
      <JobTypeChips selected={effectiveType ? [effectiveType] : []} onToggle={(id) => setJobTypeId(id)}
        only={showAll ? undefined : [...mine, ...(effectiveType && !mine.includes(effectiveType) ? [effectiveType] : [])]} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Chip label={showAll ? 'Show mine only' : 'All types of work…'} onPress={() => setShowAll(!showAll)} />
        <Chip label="Small job / repairs" selected={effectiveType === 'small'} onPress={() => setJobTypeId('small')} />
        <Chip label="+ Add your own" onPress={() => router.push('/pricing')} />
      </View>
      {guessed && !jobTypeId ? <Muted style={{ fontSize: 13 }}>Picked {jobType(guessed).name} from your description. Tap another to change.</Muted> : null}

      <H2 style={{ marginTop: 6 }}>Describe the job</H2>
      <Field
        label="Job notes (private)"
        multiline
        value={description}
        onChangeText={setDescription}
        placeholder="e.g. Basement, 3 rooms to 4 bedrooms, 45 ft of new walls, 2 new showers, washer, range and dryer, 100 sf tile…"
        help={`${Platform.OS === 'web' ? '' : 'Tap the microphone on your keyboard to talk. '}Sizes and counts get filled in for you. These notes stay private and never go on the quote.`}
      />

      <Label>Photos</Label>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <PhotoButton icon="camera-outline" label="Take photo" onPress={() => addPhotos(true)} />
        <PhotoButton icon="images-outline" label="From library" onPress={() => addPhotos(false)} />
      </View>
      {photos.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {photos.map((uri) => (
            <Pressable key={uri} accessibilityLabel="Remove photo" onLongPress={() => setPhotos((p) => p.filter((x) => x !== uri))}>
              <Image source={{ uri }} style={{ width: 72, height: 72, borderRadius: 8 }} />
            </Pressable>
          ))}
        </View>
      ) : null}
      <Muted style={{ fontSize: 13 }}>
        {claudeOn
          ? 'Claude looks at up to 8 photos for conditions, code issues and quantities.'
          : 'Photos are saved with the job. Add your Claude key in Settings to have them analyzed.'}
      </Muted>

      <H2 style={{ marginTop: 6 }}>Client</H2>
      <Field label="Client name" value={clientName} onChangeText={setClientName} />
      <Field label="Job address" value={address} onChangeText={setAddress} />
      <Field label="Estimate name (optional)" value={title} onChangeText={setTitle} placeholder="Defaults to client + job type" />

      <Label>Estimate detail</Label>
      <Segmented<EstimateMode>
        value={effectiveMode}
        onChange={setMode}
        options={[
          { value: 'quick', label: `Quick (${effectiveType ? perUnit(jobType(effectiveType).unit).trim() : '$/SF'})`, disabled: !quickAllowed },
          { value: 'detailed', label: 'Detailed', disabled: !detailedAllowed },
        ]}
      />
      {!detailedAllowed ? (
        <Banner tone="info" title="Priced from your rates">This type of work uses your price per unit and your own questions. Detailed takeoffs for it are coming in a later version.</Banner>
      ) : (
        <Muted style={{ fontSize: 13 }}>
          {effectiveMode === 'quick' ? 'Quantity × your price, plus your own priced questions. Fast price for a first call.' : 'Trade-by-trade price, material list and code checks.'}
        </Muted>
      )}
    </Screen>
  );
}

function PhotoButton({ icon, label, onPress }: { icon: 'camera-outline' | 'images-outline'; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ flex: 1, height: 72, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.card,
        alignItems: 'center', justifyContent: 'center', gap: 4, opacity: pressed ? 0.7 : 1 })}>
      <Ionicons name={icon} size={24} color={C.ink} />
      <Text style={{ fontSize: 14, color: C.ink }}>{label}</Text>
    </Pressable>
  );
}
