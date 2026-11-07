import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import { contractTotals } from '@/engine/contract';
import { money, newId } from '@/engine/format';
import { estimateJob } from '@/engine/jobTypes';
import { emptyRoom, projectProgress, type SitePhoto, type SiteProject } from '@/engine/site';
import type { Estimate } from '@/engine/types';
import { useApp } from '@/store/AppContext';
import { Button, C, Empty, Field } from '@/ui/kit';
import { PressScale, Reveal } from '@/ui/motion';
import { PhotoView } from '@/ui/SitePhotoView';
import { Text } from '@/ui/text';

type Stage = 'quote' | 'active' | 'closed';
interface Job {
  key: string;
  title: string;
  client: string;
  address: string;
  est?: Estimate;
  project?: SiteProject;
  stage: Stage;
  label: string;
  tone: string;
  bg: string;
  price?: number;
  cover?: SitePhoto;
  updated: string;
  sub?: string;
}

const FILTERS: { value: 'all' | Stage; label: string }[] = [
  { value: 'all', label: 'All' }, { value: 'quote', label: 'Quotes' }, { value: 'active', label: 'Active' }, { value: 'closed', label: 'Closed' },
];

/**
 * Jobs: one list for everything (like CompanyCam's Projects). A job is a quote until it's won, then the same job
 * gets photos, money and the crew. Tap a job to open it.
 */
export default function Jobs() {
  const { estimates, projects, contracts, profile, addProject } = useApp();
  const [filter, setFilter] = useState<'all' | Stage>('all');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [address, setAddress] = useState('');

  const jobs = useMemo<Job[]>(() => {
    const out: Job[] = [];
    for (const e of estimates) {
      const p = projects.find((x) => x.estimateId === e.id);
      const c = contracts.find((x) => x.estimateId === e.id);
      const t = c && profile ? contractTotals(e, profile, c) : null;
      const done = p?.status === 'done';
      const stage: Stage = e.status === 'lost' || done ? 'closed' : e.status === 'won' ? 'active' : 'quote';
      const label = done ? 'Done' : e.status === 'won' ? (c?.accepted ? 'Signed' : 'Won') : e.status === 'sent' ? 'Sent' : e.status === 'lost' ? 'Lost' : 'Draft';
      const tone = label === 'Done' || label === 'Lost' ? C.muted : e.status === 'won' ? C.okInk : e.status === 'sent' ? C.accent : C.ink2;
      const bg = label === 'Done' || label === 'Lost' ? C.cardHi : e.status === 'won' ? C.okBg : e.status === 'sent' ? C.accentTint : C.cardHi;
      const pr = p ? projectProgress(p) : null;
      out.push({
        key: e.id, title: e.title, client: e.clientName, address: e.address, est: e, project: p, stage, label, tone, bg,
        price: t?.total ?? e.total, cover: p ? latest(p) : undefined, updated: e.updatedAt,
        sub: t && t.paid > 0 ? `Paid ${money(t.paid)} of ${money(t.total)}` : pr && pr.total ? `${pr.done}/${pr.total} tasks done` : estimateJob(e).name,
      });
    }
    for (const p of projects.filter((x) => !x.estimateId || !estimates.some((e) => e.id === x.estimateId))) {
      const pr = projectProgress(p);
      out.push({
        key: `p_${p.id}`, title: p.title, client: p.clientName, address: p.address, project: p,
        stage: p.status === 'done' ? 'closed' : 'active', label: p.status === 'done' ? 'Done' : 'Active',
        tone: p.status === 'done' ? C.muted : C.okInk, bg: p.status === 'done' ? C.cardHi : C.okBg,
        cover: latest(p), updated: p.createdAt, sub: pr.total ? `${pr.done}/${pr.total} tasks done` : `${pr.photos} photos`,
      });
    }
    return out.sort((a, b) => b.updated.localeCompare(a.updated));
  }, [estimates, projects, contracts, profile]);

  const needle = q.trim().toLowerCase();
  const shown = jobs.filter((j) => (filter === 'all' || j.stage === filter)
    && (!needle || `${j.title} ${j.client} ${j.address}`.toLowerCase().includes(needle)));
  const count = (s: 'all' | Stage) => (s === 'all' ? jobs.length : jobs.filter((j) => j.stage === s).length);

  const open = (j: Job) => {
    if (j.project) router.push(`/site/${j.project.id}`);
    else if (j.est) router.push(`/estimate/${j.est.id}`);
  };
  const createSite = () => {
    const p: SiteProject = {
      id: newId(), title: title.trim(), clientName: '', address: address.trim(), status: 'active',
      createdAt: new Date().toISOString(), rooms: [emptyRoom(newId(), 'Area 1')], logs: [],
    };
    addProject(p);
    setAdding(false); setTitle(''); setAddress('');
    router.push(`/site/${p.id}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 10, width: '100%', maxWidth: 720, alignSelf: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, height: 46 }}>
          <Ionicons name="search" size={18} color={C.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search jobs, clients, addresses" placeholderTextColor={C.muted}
            accessibilityLabel="Search jobs" style={{ flex: 1, fontSize: 16, color: C.ink, height: 46 }} />
          {q ? <Pressable accessibilityLabel="Clear search" onPress={() => setQ('')}><Ionicons name="close-circle" size={18} color={C.muted} /></Pressable> : null}
        </View>
        <View style={{ flexDirection: 'row', backgroundColor: C.cardHi, borderRadius: 14, padding: 3 }}>
          {FILTERS.map((f) => {
            const on = filter === f.value;
            return (
              <Pressable key={f.value} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => setFilter(f.value)}
                style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 11, backgroundColor: on ? C.card : 'transparent' }}>
                <Text style={{ color: on ? C.ink : C.muted, fontWeight: on ? '700' : '500', fontSize: 14 }}>{f.label} {count(f.value) ? <Text style={{ color: C.muted, fontWeight: '400' }}>{count(f.value)}</Text> : null}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ flex: 1 }}>
        <ScrollList>
          {jobs.length === 0 ? (
            <Empty art="jobs" title="No jobs yet" text="Tap the orange + to price your first job. Every estimate becomes a job here, and when you win it, its photos, money and crew live in the same place." />
          ) : shown.length === 0 ? (
            <Text style={{ color: C.muted, textAlign: 'center', marginTop: 24 }}>No jobs match.</Text>
          ) : (
            <View style={{ backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.line, overflow: 'hidden' }}>
              {shown.map((j, i) => (
                <Reveal key={j.key} index={Math.min(i, 8)}>
                  <PressScale accessibilityRole="button" accessibilityLabel={`${j.title}, ${j.label}`} onPress={() => open(j)} scaleTo={0.99}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderTopWidth: i ? 1 : 0, borderColor: C.lineSoft }}>
                    {j.cover ? (
                      <View style={{ width: 56, height: 56, borderRadius: 14, overflow: 'hidden' }}><PhotoView photo={j.cover} width={56} /></View>
                    ) : (
                      <View style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: C.accentTint, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name={j.est ? 'document-text' : 'construct'} size={24} color={C.accent} />
                      </View>
                    )}
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ color: C.ink, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>{j.title}</Text>
                      <Text style={{ color: C.muted, fontSize: 13 }} numberOfLines={1}>{[j.client, j.address].filter(Boolean).join(' · ') || j.sub}</Text>
                      {j.client || j.address ? <Text style={{ color: C.muted, fontSize: 12 }} numberOfLines={1}>{j.sub}</Text> : null}
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      {j.price ? <Text style={{ color: C.ink, fontWeight: '700', fontSize: 15 }}>{money(j.price)}</Text> : null}
                      <View style={{ backgroundColor: j.bg, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ color: j.tone, fontSize: 12, fontWeight: '700' }}>{j.label}</Text>
                      </View>
                    </View>
                  </PressScale>
                </Reveal>
              ))}
            </View>
          )}

          {adding ? (
            <View style={{ backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.line, padding: 16, gap: 10 }}>
              <Text style={{ color: C.ink, fontWeight: '700', fontSize: 16 }}>Job without an estimate</Text>
              <Field label="Job name" value={title} onChangeText={setTitle} placeholder="e.g. Kim bathroom" maxLength={80} />
              <Field label="Address" value={address} onChangeText={setAddress} placeholder="Street, city" />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button kind="secondary" title="Cancel" onPress={() => setAdding(false)} style={{ flex: 1 }} />
                <Button title="Create" disabled={!title.trim()} onPress={createSite} style={{ flex: 1 }} />
              </View>
            </View>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => setAdding(true)} style={{ alignSelf: 'center', padding: 12 }}>
              <Text style={{ color: C.accent, fontWeight: '600' }}>+ Job without an estimate (photos only)</Text>
            </Pressable>
          )}
        </ScrollList>
      </View>
    </View>
  );
}

function latest(p: SiteProject): SitePhoto | undefined {
  return p.rooms.flatMap((r) => r.photos).sort((a, b) => b.takenAt.localeCompare(a.takenAt))[0];
}

function ScrollList({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32, width: '100%', maxWidth: 720, alignSelf: 'center' }}>
      {children}
    </ScrollView>
  );
}
