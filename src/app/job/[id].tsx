import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { newId } from '@/engine/format';
import { findJob } from '@/engine/job';
import { estimateJob } from '@/engine/jobTypes';
import { emptyRoom, type PhotoKind } from '@/engine/site';
import { useApp } from '@/store/AppContext';
import { JobMoney } from '@/ui/job/JobMoney';
import { JobOverview } from '@/ui/job/JobOverview';
import { JobPhotos, TakePhotos } from '@/ui/job/JobPhotos';
import { StageBar } from '@/ui/job/StageBar';
import { Button, C, Muted, Screen, Segmented } from '@/ui/kit';
import { confirmAction, notify } from '@/ui/notify';
import { ActionSheet, type SheetAction } from '@/ui/Sheet';
import { addSitePhotos } from '@/ui/SitePhotoView';
import { Text } from '@/ui/text';

type View3 = 'overview' | 'photos' | 'money';

/**
 * One job, one page. The estimate, the quote, the signature, the photos and the money all live here, with the
 * step the job is on and the next thing to do at the top.
 */
export default function JobScreen() {
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>();
  const app = useApp();
  const insets = useSafeAreaInsets();
  const job = findJob(id, app.estimates, app.projects, app.contracts, app.profile);
  const [picked, setPicked] = useState<View3 | null>(tab === 'photos' || tab === 'money' ? tab : null);
  const [menu, setMenu] = useState(false);
  const [shooting, setShooting] = useState(false);

  if (!job) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Job' }} />
        <Muted>This job was deleted.</Muted>
        <Button title="Back to jobs" onPress={() => router.dismissTo('/jobs')} />
      </Screen>
    );
  }
  const { est, project } = job;
  // A photo-only job opens on its photos; every other job opens on the overview.
  const view: View3 = picked ?? (est ? 'overview' : 'photos');

  /** The job site behind this job, made the first time photos or costs need a place to go. */
  const needSite = (): string | null => project?.id ?? (est ? app.projectForEstimate(est.id) : null);

  const openCamera = () => { if (needSite()) { setPicked('photos'); setShooting(true); } };

  const capture = async (roomId: string, kind: PhotoKind, camera: boolean) => {
    const pid = needSite();
    setShooting(false);
    if (!pid) return;
    const added = await addSitePhotos(camera, kind);
    if (added.length) app.updateProject(pid, (x) => ({ ...x, rooms: x.rooms.map((r) => (r.id === roomId ? { ...r, photos: [...r.photos, ...added] } : r)) }));
  };

  const editAnswers = () => {
    if (!est) return;
    const jt = estimateJob(est);
    if (jt.deleted) return notify('This type of work was deleted', `Re-pricing would lose your ${jt.name} prices. The quote stays as it was sent. Make a new estimate to change it.`);
    app.setDraft({
      id: est.id, jobTypeId: est.jobTypeId, mode: est.mode, title: est.title, clientName: est.clientName, address: est.address,
      description: est.description, scopeNote: est.scopeNote ?? '', aiNotes: est.aiNotes ?? [], photos: est.photos, finish: est.finish, answers: est.answers,
      customItems: est.customItems, heard: [], markupPct: est.markupPct, plan: est.plan,
    });
    router.push('/questions');
  };

  // Same job for another client (or the next unit): a new draft with the same scope, prices and quote wording.
  const copy = () => {
    if (!est) return;
    const newEst = app.commitDraft({
      jobTypeId: est.jobTypeId, mode: est.mode, title: `${estimateJob(est).name} (copy)`, clientName: '', address: '',
      description: est.description, scopeNote: est.scopeNote ?? '', aiNotes: est.aiNotes ?? [], photos: [], finish: est.finish,
      answers: est.answers, customItems: est.customItems, heard: [], markupPct: est.markupPct, plan: est.plan,
    });
    if (est.quoteEdits) app.updateEstimate(newEst, { quoteEdits: est.quoteEdits });
    router.replace(`/job/${newEst}`);
    notify('Copied', 'A new draft with the same work and prices. Tap ⋯ → Edit job details to add the client, then send it.');
  };

  const remove = () =>
    confirmAction('Delete this job?', project ? 'The estimate, quote, photos, to-dos and costs are deleted from this phone. This cannot be undone.' : 'The estimate and its quote are deleted. This cannot be undone.', 'Delete', () => {
      if (project) {
        app.deletePhotosLater([...project.rooms.flatMap((r) => r.photos.map((ph) => ph.uri)), ...(project.money?.costs.flatMap((c) => (c.receiptUri ? [c.receiptUri] : [])) ?? [])]);
        app.deleteProject(project.id);
      }
      if (est) app.deleteEstimate(est.id);
      router.dismissTo('/jobs');
    });

  const setStatus = (status: 'draft' | 'sent' | 'won' | 'lost') => { if (est) app.updateEstimate(est.id, { status }); };
  const signed = !!job.contract?.accepted;
  const actions: SheetAction[] = [
    ...(est ? [
      { icon: 'create-outline' as const, label: 'Edit job details', sub: 'Client, sizes and answers. The price updates.', onPress: editAnswers },
      { icon: 'copy-outline' as const, label: 'Copy for another client', sub: 'Same work and prices, new quote', onPress: copy },
    ] : []),
    ...(job.stage === 'draft' ? [{ icon: 'paper-plane-outline' as const, label: 'Mark as sent', sub: 'You gave the client the quote another way', onPress: () => setStatus('sent') }] : []),
    ...(job.stage === 'draft' || job.stage === 'sent' ? [
      { icon: 'trophy-outline' as const, label: 'Mark as won', sub: 'The client said yes without signing in the app', onPress: () => setStatus('won') },
      { icon: 'close-circle-outline' as const, label: 'Mark as lost', onPress: () => setStatus('lost') },
    ] : []),
    ...(job.stage === 'won' && !signed ? [{ icon: 'arrow-undo-outline' as const, label: 'Not won yet', sub: 'Move it back to Sent', onPress: () => setStatus('sent') }] : []),
    ...(project && (job.stage === 'won' || job.stage === 'site') ? [{ icon: 'checkmark-done-outline' as const, label: 'Mark job finished', onPress: () => app.updateProject(project.id, (x) => ({ ...x, status: 'done' })) }] : []),
    ...(project && job.stage === 'done' ? [{ icon: 'refresh-outline' as const, label: 'Reopen job', onPress: () => app.updateProject(project.id, (x) => ({ ...x, status: 'active' })) }] : []),
    ...(est && job.stage === 'won' && !project ? [{ icon: 'checkmark-done-outline' as const, label: 'Mark job finished', onPress: () => { const pid = needSite(); if (pid) app.updateProject(pid, (x) => ({ ...x, status: 'done' })); } }] : []),
    { icon: 'trash-outline' as const, label: 'Delete job', danger: true, onPress: remove },
  ];

  const shootProject = shooting ? project : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{
        title: 'Job',
        headerRight: () => (
          <Pressable accessibilityRole="button" accessibilityLabel="More actions" onPress={() => setMenu(true)} hitSlop={10} style={{ paddingHorizontal: 6 }}>
            <Ionicons name="ellipsis-horizontal-circle-outline" size={26} color={C.ink} />
          </Pressable>
        ),
      }} />
      <Screen footer={view === 'photos' && project ? <Button title="Take photos" icon="camera" onPress={openCamera} /> : undefined}>
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 24, fontWeight: '700', color: C.ink, letterSpacing: -0.3 }}>{job.title}</Text>
          <Muted>{[job.client, job.address].filter(Boolean).join(' · ') || (est ? `${estimateJob(est).name} · no client yet` : 'No address yet')}</Muted>
        </View>
        {est ? <StageBar job={job} /> : null}
        <Segmented<View3> value={view} onChange={setPicked}
          options={[{ value: 'overview', label: 'Overview' }, { value: 'photos', label: 'Job site' }, { value: 'money', label: 'Money' }]} />

        {view === 'overview' ? (
          <JobOverview job={job} onPhotos={openCamera} onMoney={() => setPicked('money')} onReopen={() => setStatus('sent')} />
        ) : view === 'photos' ? (
          <JobPhotos project={project} onStart={openCamera} />
        ) : (
          <JobMoney job={job} needSite={needSite} />
        )}
      </Screen>

      <ActionSheet visible={menu} onClose={() => setMenu(false)} title={job.title} actions={actions} />

      {/* Not a pop-up window on purpose: the iPhone camera cannot open while one is closing. */}
      {shooting && shootProject ? (
        <Pressable accessibilityLabel="Close" onPress={() => setShooting(false)} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(11,19,36,0.45)', justifyContent: 'flex-end' }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: C.card, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: insets.bottom + 12, gap: 12, width: '100%', maxWidth: 640, alignSelf: 'center' }}>
            <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: C.line }} />
            <Text style={{ color: C.ink, fontSize: 20, fontWeight: '700' }}>Take photos</Text>
            {shootProject.rooms.length ? (
              <TakePhotos project={shootProject} onClose={() => setShooting(false)} onCapture={capture} />
            ) : (
              <>
                <Text style={{ color: C.ink2 }}>Add an area first (a room, the siding, a repair spot) so every photo has a place.</Text>
                <Button title="Add “Area 1”" icon="add" onPress={() => app.updateProject(shootProject.id, (x) => ({ ...x, rooms: [...x.rooms, emptyRoom(newId(), 'Area 1')] }))} />
              </>
            )}
          </Pressable>
        </Pressable>
      ) : null}
    </View>
  );
}
