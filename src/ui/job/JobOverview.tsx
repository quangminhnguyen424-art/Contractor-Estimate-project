import { dateLocale } from '@/engine/locale';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { nextFollowUp } from '@/engine/followup';
import { cityFromAddress, permitPlan } from '@/engine/permits';
import { contractTotals } from '@/engine/contract';
import { dateFmt, money } from '@/engine/format';
import { nextStep, type Job, type NextKind } from '@/engine/job';
import { dayLabel, upcoming } from '@/engine/schedule';
import { useApp } from '@/store/AppContext';

import { Banner, Button, List, ListRow, Section } from '../kit';
import { Text } from '../text';
import { C } from '../theme';
import { useToday } from '../useToday';

const NEXT_ICON: Record<NextKind, React.ComponentProps<typeof Ionicons>['name']> = {
  send: 'paper-plane', sign: 'create', photos: 'camera', collect: 'cash', update: 'images', work: 'camera', wrap: 'stats-chart', reopen: 'refresh', estimate: 'add',
};

/**
 * The first view of a job: the price, the one next step, and the job's documents. Cost and markup stay one tap
 * away in "Price details", so this page is safe to show a client.
 */
export function JobOverview({ job, onPhotos, onMoney, onReopen }: {
  job: Job; onPhotos: () => void; onMoney: () => void; onReopen: () => void;
}) {
  const { events, followups, updateEstimate, profile } = useApp();
  const today = useToday();
  const { est, project, contract } = job;
  const step = nextStep(job);
  const lastNote = est?.clientNotes?.[est.clientNotes.length - 1];
  const warns = est?.checks.filter((c) => c.level === 'warn').length ?? 0;
  const nextVisit = upcoming(events.filter((e) => !e.title.startsWith('Follow up:') && ((project && e.projectId === project.id) || (est && e.estimateId === est.id))), today, 60)[0];
  const plan = est ? followups?.find((f) => f.estimateId === est.id) : undefined;
  const signedAt = contract?.accepted?.signedAt;
  // The line under the total must add up to it: with a contract that is the contract's price (change orders included).
  const ct = est && contract && profile ? contractTotals(est, profile, contract) : null;
  const shown = est ? (ct ? { price: ct.price, tax: Math.round((ct.total - ct.price) * 100) / 100 } : { price: est.price, tax: est.tax }) : null;

  const act = () => {
    if (step.kind === 'send' && est) router.push(`/estimate/${est.id}/quote`);
    else if (step.kind === 'sign' && est) router.push(`/estimate/${est.id}/sign`);
    else if (step.kind === 'collect' && est) router.push(`/estimate/${est.id}/contract`);
    else if (step.kind === 'update' && project) router.push(`/site/${project.id}/share?mode=client`);
    else if (step.kind === 'wrap') onMoney();
    else if (step.kind === 'reopen') onReopen();
    else onPhotos();
  };

  return (
    <>
      {lastNote && job.stage !== 'won' && job.stage !== 'done' ? (
        <Banner tone="warn" title={`${lastNote.name || 'The client'} asked for changes`}>
          {`“${lastNote.text}”\n${new Date(lastNote.at).toLocaleString(dateLocale(), { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}. Update the quote, then send a new link.`}
        </Banner>
      ) : null}

      {est ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Client total ${money(job.total ?? est.total)}. Open price details.`} onPress={() => router.push(`/estimate/${est.id}`)}
          style={({ pressed }) => ({ backgroundColor: C.dark, borderRadius: 22, padding: 18, gap: 6, borderWidth: 1, borderColor: '#D6E0FF', opacity: pressed ? 0.85 : 1 })}>
          <Text style={{ color: C.ink2, fontSize: 14 }}>Client total</Text>
          <Text style={{ color: C.accent, fontSize: 36, fontWeight: '800', letterSpacing: -0.5 }}>{money(job.total ?? est.total)}</Text>
          <Text style={{ color: C.ink2, fontSize: 13 }}>{money(shown?.price ?? est.price)} + {est.salesTaxPct}% tax {money(shown?.tax ?? est.tax)}{job.paid > 0 ? ` · paid ${money(job.paid)}` : ''}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <Text style={{ color: C.accentDark, fontWeight: '600', fontSize: 14 }}>Price details{warns ? ` · ${warns} to check` : ''}</Text>
            <Ionicons name="chevron-forward" size={14} color={C.accentDark} />
          </View>
        </Pressable>
      ) : null}

      {/* The one next step. */}
      <View style={{ backgroundColor: C.card, borderRadius: 22, borderWidth: 1, borderColor: C.line, padding: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: C.accentTint, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={NEXT_ICON[step.kind]} size={22} color={C.accent} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: C.ink, fontSize: 17, fontWeight: '700' }}>{step.title}</Text>
            <Text style={{ color: C.ink2, fontSize: 14, lineHeight: 20 }}>{step.sub}</Text>
          </View>
        </View>
        <Button title={step.action} icon={NEXT_ICON[step.kind]} onPress={act} />
        {job.stage === 'sent' && est ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button kind="secondary" title="Send again" icon="paper-plane-outline" style={{ flex: 1 }} onPress={() => router.push(`/estimate/${est.id}/quote`)} />
            <Button kind="secondary" title="Mark won" icon="trophy-outline" style={{ flex: 1 }} onPress={() => updateEstimate(est.id, { status: 'won' })} />
          </View>
        ) : null}
        {!est && job.stage === 'site' ? (
          <Button kind="secondary" title="Price this job" icon="add" onPress={() => router.dismissTo(`/new?project=${project?.id ?? ''}`)} />
        ) : null}
      </View>

      {est ? (
        <>
          <Section title="Quote and contract" />
          <List>
            <ListRow icon="document-text" title="Client quote"
              sub={signedAt ? `Signed ${dateFmt(signedAt)}` : job.stage === 'draft' ? 'Not sent yet · edit the wording, then send' : job.stage === 'sent' ? `Sent ${dateFmt(est.sentAt ?? est.updatedAt)}` : 'See, edit or send it again'}
              onPress={() => router.push(`/estimate/${est.id}/quote`)} />
            {job.stage === 'sent' ? (
              <ListRow icon="notifications" title="Follow-ups"
                sub={!plan || plan.consent === 'not-asked' ? 'Ask the client first, then Bidwell reminds them' : plan.stopped ? 'Stopped' : (() => { const n = nextFollowUp(plan, est.status); return n ? `Next reminder ${dateFmt(`${n.date}T12:00:00`)}` : 'All reminders sent'; })()}
                onPress={() => router.push(`/estimate/${est.id}/follow`)} />
            ) : null}
            {job.stage === 'won' || job.stage === 'done' || contract ? (
              <ListRow icon="wallet" title="Contract and payments"
                sub={job.paid > 0 ? `Paid ${money(job.paid)} of ${money(job.total ?? est.total)}` : 'Deposit, invoices, change orders'}
                right={job.due > 0.5 ? `${money(job.due)} due` : undefined}
                onPress={() => router.push(`/estimate/${est.id}/contract`)} />
            ) : null}
            {(() => {
              const pp = permitPlan({ jobTypeId: est.jobTypeId, answers: est.answers, city: est.permit?.parcel?.city ?? cityFromAddress(est.address) });
              if (pp.none) return null;
              const d = (est.permit?.done ?? []).filter((x) => pp.checklist.some((c) => c.id === x)).length;
              const must = pp.items.filter((i) => i.need === 'required').length;
              return (
                <ListRow icon="ribbon" title="Permits"
                  sub={d ? `${d} of ${pp.checklist.length} steps done · ${pp.jurisdiction.name}` : must ? `${must} permit${must === 1 ? '' : 's'} needed · ${pp.jurisdiction.name}` : `Check what this job needs · ${pp.jurisdiction.name}`}
                  onPress={() => router.push(`/estimate/${est.id}/permit`)} />
              );
            })()}
            <ListRow icon="calendar" title="Schedule" sub={nextVisit ? `Next: ${nextVisit.title}, ${dayLabel(nextVisit.date, today)}` : 'Add a visit, crew day or inspection'}
              onPress={() => router.push(nextVisit ? `/event?id=${nextVisit.id}` : project ? `/event?project=${project.id}` : `/event?estimate=${est.id}`)} />
          </List>
        </>
      ) : null}
    </>
  );
}
