import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View, StyleSheet } from 'react-native';

import { money, newId } from '@/engine/format';
import { listJobs, type Job, type JobStage } from '@/engine/job';
import { estimateJob } from '@/engine/jobTypes';
import { emptyRoom, projectProgress, type SiteProject } from '@/engine/site';
import { useApp } from '@/store/AppContext';
import { Button, C, Empty, Field } from '@/ui/kit';
import { PressScale, Reveal } from '@/ui/motion';
import { PhotoView } from '@/ui/SitePhotoView';
import { NUM, Text, TextInput } from '@/ui/text';

type Group = 'quote' | 'active' | 'closed';
const GROUP: Record<JobStage, Group> = { draft: 'quote', sent: 'quote', won: 'active', site: 'active', done: 'closed', lost: 'closed' };
const FILTERS: { value: 'all' | Group; label: string }[] = [
  { value: 'all', label: 'All' }, { value: 'quote', label: 'Quotes' }, { value: 'active', label: 'Active' }, { value: 'closed', label: 'Closed' },
];
const PILL: Record<JobStage, { fg: string; bg: string }> = {
  draft: { fg: C.ink2, bg: C.cardHi }, sent: { fg: C.accent, bg: C.accentTint }, won: { fg: C.okInk, bg: C.okBg }, site: { fg: C.okInk, bg: C.okBg },
  done: { fg: C.muted, bg: C.cardHi }, lost: { fg: C.muted, bg: C.cardHi },
};

/** The small line under a job: money collected, to-dos, or the type of work. */
function subLine(j: Job): string {
  if (j.paid > 0 && j.total) return `Paid ${money(j.paid)} of ${money(j.total)}`;
  const pr = j.project ? projectProgress(j.project) : null;
  if (pr?.total) return `${pr.done}/${pr.total} to-dos done`;
  if (j.est) return estimateJob(j.est).name;
  return pr ? `${pr.photos} photo${pr.photos === 1 ? '' : 's'}` : '';
}

/**
 * Jobs: one list for everything (like CompanyCam's Projects). A job is a quote until it's won, then the same job
 * gets photos, money and the crew. Tap a job to open it.
 */
export default function Jobs() {
  const { estimates, projects, contracts, profile, addProject } = useApp();
  const params = useLocalSearchParams<{ show?: string; n?: string }>();
  const [filter, setFilter] = useState<'all' | Group>('all');
  const [q, setQ] = useState('');
  // Home's numbers open the list already filtered. Each tap carries a fresh `n`, so tapping the same number again
  // later filters again (a request that looked the same as the last one would not be noticed).
  const ask = params.show ? `${params.show}|${params.n ?? ''}` : undefined;
  const [lastAsk, setLastAsk] = useState<string | undefined>(undefined);
  if (ask !== lastAsk) {
    setLastAsk(ask);
    const show = params.show;
    if (show === 'quote' || show === 'active' || show === 'closed' || show === 'all') { setFilter(show); setQ(''); }
  }
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [address, setAddress] = useState('');

  const jobs = useMemo(() => listJobs(estimates, projects, contracts, profile), [estimates, projects, contracts, profile]);
  const needle = q.trim().toLowerCase();
  const shown = jobs.filter((j) => (filter === 'all' || GROUP[j.stage] === filter)
    && (!needle || `${j.title} ${j.client} ${j.address}`.toLowerCase().includes(needle)));
  const count = (g: 'all' | Group) => (g === 'all' ? jobs.length : jobs.filter((j) => GROUP[j.stage] === g).length);

  const createSite = () => {
    const p: SiteProject = {
      id: newId(), title: title.trim(), clientName: '', address: address.trim(), status: 'active',
      createdAt: new Date().toISOString(), rooms: [emptyRoom(newId(), 'Area 1')], logs: [],
    };
    addProject(p);
    setAdding(false); setTitle(''); setAddress('');
    router.push(`/job/${p.id}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 10, width: '100%', maxWidth: 720, alignSelf: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.panel, borderRadius: 16, paddingHorizontal: 12, height: 46 }}>
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
            <Empty art="jobs" title="No jobs yet" text="Tap the orange + to price your first job. Each job keeps its quote, signature, photos and money on one page." />
          ) : shown.length === 0 ? (
            <Text style={{ color: C.muted, textAlign: 'center', marginTop: 24 }}>No jobs match.</Text>
          ) : (
            <View style={{ backgroundColor: C.panel, borderRadius: 16, overflow: 'hidden' }}>
              {shown.map((j, i) => {
                const sub = subLine(j);
                const who = [j.client, j.address].filter(Boolean).join(' · ');
                return (
                  <Reveal key={j.key} index={Math.min(i, 8)}>
                    <PressScale accessibilityRole="button" accessibilityLabel={`${j.title}, ${j.label}`} onPress={() => router.push(`/job/${j.key}`)} scaleTo={0.99}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13, borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderColor: C.line }}>
                      {j.cover ? <View style={{ width: 48, height: 48, borderRadius: 10, overflow: 'hidden' }}><PhotoView photo={j.cover} width={48} /></View> : null}
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text raw style={{ color: C.ink, fontSize: 16, fontWeight: '600' }} numberOfLines={2}>{j.title}</Text>
                        <Text style={{ color: C.muted, fontSize: 13 }} numberOfLines={1}>{who || sub}</Text>
                        {who && sub ? <Text style={{ color: C.muted, fontSize: 12 }} numberOfLines={1}>{sub}</Text> : null}
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        {j.total ? <Text style={{ color: C.ink, fontWeight: '600', fontSize: 16, fontFamily: NUM }}>{money(j.total)}</Text> : null}
                        <Text style={{ color: PILL[j.stage].fg, fontSize: 13, fontWeight: '500' }}>{j.label}</Text>
                      </View>
                    </PressScale>
                  </Reveal>
                );
              })}
            </View>
          )}

          {adding ? (
            <View style={{ backgroundColor: C.panel, borderRadius: 16, padding: 16, gap: 10 }}>
              <Text style={{ color: C.ink, fontWeight: '700', fontSize: 16 }}>Photo-only job</Text>
              <Field label="Job name" value={title} onChangeText={setTitle} placeholder="e.g. Kim bathroom" maxLength={80} />
              <Field label="Address" value={address} onChangeText={setAddress} placeholder="Street, city" />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button kind="secondary" title="Cancel" onPress={() => setAdding(false)} style={{ flex: 1 }} />
                <Button title="Create" disabled={!title.trim()} onPress={createSite} style={{ flex: 1 }} />
              </View>
            </View>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => setAdding(true)} style={{ alignSelf: 'center', padding: 12 }}>
              <Text style={{ color: C.accent, fontWeight: '500', fontSize: 15 }}>Add a photo-only job</Text>
            </Pressable>
          )}
        </ScrollList>
      </View>
    </View>
  );
}

function ScrollList({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive" contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32, width: '100%', maxWidth: 720, alignSelf: 'center' }}>
      {children}
    </ScrollView>
  );
}
