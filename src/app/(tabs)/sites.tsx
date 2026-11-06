import { router } from 'expo-router';
import { useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, useWindowDimensions, View } from 'react-native';

import { Text } from '@/ui/text';
import { newId } from '@/engine/format';
import { estimateJob } from '@/engine/jobTypes';
import { emptyRoom, projectProgress, projectSummary, type SiteProject } from '@/engine/site';
import { useApp } from '@/store/AppContext';
import { Badge, Button, C, Card, Empty, Field, H2, Muted, Screen } from '@/ui/kit';
import { PressScale, Progress, Reveal } from '@/ui/motion';
import { PhotoView } from '@/ui/SitePhotoView';

/** Job sites: one project per job you won. Rooms, photos with instructions, tasks for the crew. */
export default function Sites() {
  const { projects, estimates, addProject, projectForEstimate } = useApp();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [address, setAddress] = useState('');
  const wonWithout = estimates.filter((e) => e.status === 'won' && !projects.some((p) => p.estimateId === e.id));
  const active = projects.filter((p) => p.status === 'active');
  const done = projects.filter((p) => p.status === 'done');

  const open = (id: string | null) => { if (id) router.push(`/site/${id}`); };
  const create = () => {
    const p: SiteProject = {
      id: newId(), title: title.trim(), clientName: '', address: address.trim(), status: 'active',
      createdAt: new Date().toISOString(), rooms: [emptyRoom(newId(), 'Room 1')], logs: [],
    };
    addProject(p);
    setAdding(false); setTitle(''); setAddress('');
    open(p.id);
  };

  return (
    <Screen>

      {wonWithout.length ? (
        <Card>
          <H2>Start from a won job</H2>
          {wonWithout.map((e) => (
            <Pressable key={e.id} accessibilityRole="button" onPress={() => open(projectForEstimate(e.id))}
              style={{ paddingVertical: 8, borderTopWidth: 1, borderColor: C.lineSoft, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.ink, fontWeight: '600' }}>{e.title}</Text>
                <Muted style={{ fontSize: 13 }}>{estimateJob(e).name}{e.plan?.length ? ` · ${e.plan.length} room${e.plan.length > 1 ? 's' : ''} from the floor plan` : ''}</Muted>
              </View>
              <Text style={{ color: C.accent, fontWeight: '700' }}>Start</Text>
            </Pressable>
          ))}
        </Card>
      ) : null}

      {active.length === 0 && !wonWithout.length ? (
        <Empty art="site" title="No job sites yet"
          text="Every job you win gets a job site: photos room by room with arrows and notes, a task list your crew checks off, daily logs and photo updates for the client." />
      ) : null}

      {active.map((p, i) => <ProjectCard key={p.id} p={p} index={i} onPress={() => open(p.id)} />)}

      {adding ? (
        <Card>
          <H2>New project</H2>
          <Field label="Job name" value={title} onChangeText={setTitle} placeholder="e.g. Kim kitchen remodel" maxLength={80} />
          <Field label="Address" value={address} onChangeText={setAddress} placeholder="Job address" maxLength={160} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button kind="secondary" title="Cancel" style={{ flex: 1 }} onPress={() => setAdding(false)} />
            <Button title="Create" style={{ flex: 1 }} disabled={!title.trim()} onPress={create} />
          </View>
        </Card>
      ) : (
        <Button kind="secondary" title="+ New project" onPress={() => setAdding(true)} />
      )}

      {done.length ? (
        <>
          <H2 style={{ marginTop: 8 }}>Finished</H2>
          {done.map((p, i) => <ProjectCard key={p.id} p={p} index={i} onPress={() => open(p.id)} />)}
        </>
      ) : null}
    </Screen>
  );
}

const daysSince = (iso: string) => Math.floor((Date.now() - Date.parse(iso)) / 86400000);

/** A job as a big photo card: the latest photo, progress, and what happened lately. */
function ProjectCard({ p, onPress, index }: { p: SiteProject; onPress: () => void; index: number }) {
  const { width } = useWindowDimensions();
  const pr = projectProgress(p);
  const photos = p.rooms.flatMap((r) => r.photos).sort((a, b) => b.takenAt.localeCompare(a.takenAt));
  const cover = photos[0];
  const w = Math.min(width, 760) - 32;
  const last = [cover?.takenAt, p.logs[0]?.date, p.createdAt].filter(Boolean).sort().pop() ?? p.createdAt;
  const ago = daysSince(last);
  return (
    <Reveal index={index}>
      <PressScale accessibilityRole="button" accessibilityLabel={p.title} onPress={onPress} scaleTo={0.98}
        style={{ backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, overflow: 'hidden' }}>
        {cover ? (
          <View style={{ height: Math.round(w * 0.5), overflow: 'hidden' }}>
            <PhotoView photo={{ ...cover, markup: [] }} width={w} />
            <View style={{ position: 'absolute', right: 10, top: 10, flexDirection: 'row', gap: 6 }}>
              <Pill icon="images" text={String(photos.length)} />
              {pr.total ? <Pill icon="checkmark-done" text={`${pr.pct}%`} /> : null}
            </View>
          </View>
        ) : (
          <View style={{ height: 86, backgroundColor: C.cardHi, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>
            <Ionicons name="camera-outline" size={22} color={C.muted} />
            <Text style={{ color: C.muted }}>No photos yet</Text>
          </View>
        )}
        <View style={{ padding: 14, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontWeight: '800', color: C.ink, flex: 1, fontSize: 17 }} numberOfLines={1}>{p.title}</Text>
            {p.status === 'done' ? <Badge label="Finished" tone="ok" /> : null}
          </View>
          {p.address ? <Text style={{ color: C.muted, fontSize: 13 }} numberOfLines={1}>{p.address}</Text> : null}
          <Progress value={pr.total ? pr.done / pr.total : 0} color={p.status === 'done' ? C.okInk : C.accent} height={6} />
          <Text style={{ color: C.muted, fontSize: 12 }}>{projectSummary(p)} · {ago <= 0 ? 'active today' : `active ${ago}d ago`}</Text>
        </View>
      </PressScale>
    </Reveal>
  );
}

function Pill({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(2,6,23,0.72)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 }}>
      <Ionicons name={icon} size={13} color="#FFFFFF" />
      <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}
