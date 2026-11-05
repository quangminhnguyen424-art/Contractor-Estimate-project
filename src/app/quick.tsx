import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { newId } from '@/engine/format';
import { emptyRoom, type PhotoKind } from '@/engine/site';
import { useApp } from '@/store/AppContext';
import { C, Chip, Muted, Segmented, Tile } from '@/ui/kit';
import { Reveal } from '@/ui/motion';
import { addSitePhotos, KIND_LABEL } from '@/ui/SitePhotoView';
import { Text } from '@/ui/text';

/** The big + button: start the most common things in one tap. Job photos go straight into a project and room. */
export default function QuickSheet() {
  const { projects, updateProject } = useApp();
  const insets = useSafeAreaInsets();
  const active = projects.filter((p) => p.status === 'active');
  const [step, setStep] = useState<'menu' | 'project' | 'room'>('menu');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [kind, setKind] = useState<PhotoKind>('progress');
  const [busy, setBusy] = useState(false);
  const project = projects.find((p) => p.id === projectId);

  const go = (href: string) => { router.back(); setTimeout(() => router.push(href as never), 60); };

  const shoot = async (roomId: string | null) => {
    if (!project) return;
    setBusy(true);
    const added = await addSitePhotos(true, kind);
    setBusy(false);
    if (!added.length) return;
    let rid = roomId;
    updateProject(project.id, (p) => {
      if (rid) return { ...p, rooms: p.rooms.map((r) => (r.id === rid ? { ...r, photos: [...r.photos, ...added] } : r)) };
      rid = newId();
      return { ...p, rooms: [...p.rooms, { ...emptyRoom(rid, `Room ${p.rooms.length + 1}`), photos: added }] };
    });
    go(`/site/${project.id}/room/${rid}`);
  };

  return (
    <View style={{ flex: 1, justifyContent: 'flex-end' }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(2,6,23,0.6)' }} onPress={() => router.back()} />
      <Reveal>
        <View style={{ backgroundColor: C.bg, borderTopLeftRadius: 10, borderTopRightRadius: 10, borderWidth: 1, borderColor: C.line, padding: 18, gap: 12, paddingBottom: Math.max(18, insets.bottom + 8), width: '100%', maxWidth: 760, alignSelf: 'center' }}>
          <View style={{ width: 44, height: 5, borderRadius: 3, backgroundColor: C.line, alignSelf: 'center' }} />
          {step === 'menu' ? (
            <>
              <Text style={{ color: C.ink, fontSize: 20, fontWeight: '800' }}>What do you want to do?</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                <Tile index={0} icon="calculator-outline" title="New estimate" sub="Describe it, Bidwell prices it" onPress={() => go('/new')} />
                <Tile index={1} icon="camera-outline" tone="sky" title="Job photo" sub="Straight into a job and room"
                  onPress={() => (active.length ? setStep('project') : go('/sites'))} />
                <Tile index={2} icon="scan-outline" title="Scan 3D" sub="Measure rooms with LiDAR" onPress={() => go('/scan')} />
                <Tile index={3} icon="calendar-outline" tone="sky" title="Appointment" sub="Visit, crew day, call" onPress={() => go('/event')} />
              </View>
              {!active.length ? <Muted style={{ fontSize: 12 }}>Job photos go into a job site. Start one from a won estimate or the Job Site tab.</Muted> : null}
            </>
          ) : step === 'project' ? (
            <>
              <Back onPress={() => setStep('menu')} />
              <Text style={{ color: C.ink, fontSize: 20, fontWeight: '800' }}>Which job?</Text>
              {active.map((p, i) => (
                <Reveal key={p.id} index={i}>
                  <Pressable accessibilityRole="button" onPress={() => { setProjectId(p.id); setStep('room'); }}
                    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 6, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, opacity: pressed ? 0.75 : 1 })}>
                    <Ionicons name="construct-outline" size={22} color={C.accent} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.ink, fontWeight: '700' }}>{p.title}</Text>
                      {p.address ? <Text style={{ color: C.muted, fontSize: 13 }} numberOfLines={1}>{p.address}</Text> : null}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={C.muted} />
                  </Pressable>
                </Reveal>
              ))}
            </>
          ) : project ? (
            <>
              <Back onPress={() => setStep('project')} />
              <Text style={{ color: C.ink, fontSize: 20, fontWeight: '800' }}>{project.title}: which room?</Text>
              <Segmented<PhotoKind> value={kind} onChange={setKind} options={(['before', 'progress', 'after'] as PhotoKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {project.rooms.map((r) => <Chip key={r.id} label={`${r.name} · ${r.photos.length}`} onPress={() => !busy && shoot(r.id)} />)}
                <Chip label="+ New room" onPress={() => !busy && shoot(null)} />
              </View>
              <Muted style={{ fontSize: 12 }}>{busy ? 'Saving photos…' : 'The camera opens. Take as many as you need.'}</Muted>
            </>
          ) : null}
        </View>
      </Reveal>
    </View>
  );
}

function Back({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Ionicons name="chevron-back" size={18} color={C.accent} />
      <Text style={{ color: C.accent, fontWeight: '600' }}>Back</Text>
    </Pressable>
  );
}
