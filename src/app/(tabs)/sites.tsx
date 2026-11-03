import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { newId } from '@/engine/format';
import { estimateJob } from '@/engine/jobTypes';
import { emptyRoom, projectProgress, projectSummary, type SiteProject } from '@/engine/site';
import { useApp } from '@/store/AppContext';
import { Button, C, Card, Field, H2, Muted, Screen } from '@/ui/kit';

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
      <Muted>
        After you win a job: photos room by room with arrows and notes, a task list your crew checks off, daily logs and updates for the client.
      </Muted>

      {wonWithout.length ? (
        <Card>
          <H2>Start from a won job</H2>
          {wonWithout.map((e) => (
            <Pressable key={e.id} accessibilityRole="button" onPress={() => open(projectForEstimate(e.id))}
              style={{ paddingVertical: 8, borderTopWidth: 1, borderColor: C.lineSoft, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.ink, fontWeight: '600' }}>{e.title}</Text>
                <Muted style={{ fontSize: 13 }}>{estimateJob(e).name}{e.plan?.length ? ` · ${e.plan.length} rooms from the floor plan` : ''}</Muted>
              </View>
              <Text style={{ color: C.accent, fontWeight: '700' }}>Start</Text>
            </Pressable>
          ))}
        </Card>
      ) : null}

      {active.length === 0 && !wonWithout.length ? (
        <Card>
          <H2>No job sites yet</H2>
          <Muted style={{ fontSize: 13 }}>Mark an estimate Won and it shows up here, or start a project for any job below.</Muted>
        </Card>
      ) : null}

      {active.map((p) => <ProjectRow key={p.id} p={p} onPress={() => open(p.id)} />)}

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
          {done.map((p) => <ProjectRow key={p.id} p={p} onPress={() => open(p.id)} />)}
        </>
      ) : null}
    </Screen>
  );
}

function ProjectRow({ p, onPress }: { p: SiteProject; onPress: () => void }) {
  const pr = projectProgress(p);
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <Card style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          <Text style={{ fontWeight: '700', color: C.ink, flex: 1, fontSize: 16 }} numberOfLines={1}>{p.title}</Text>
          <Text style={{ color: p.status === 'done' ? C.okInk : C.accent, fontWeight: '700' }}>{pr.total ? `${pr.pct}%` : 'New'}</Text>
        </View>
        {p.address ? <Muted style={{ fontSize: 13 }}>{p.address}</Muted> : null}
        <View style={{ height: 6, borderRadius: 3, backgroundColor: C.line }}>
          <View style={{ width: `${pr.pct}%`, height: 6, borderRadius: 3, backgroundColor: p.status === 'done' ? C.okInk : C.accent }} />
        </View>
        <Muted style={{ fontSize: 13 }}>{projectSummary(p)}</Muted>
      </Card>
    </Pressable>
  );
}
