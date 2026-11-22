import { View } from 'react-native';

import { rate } from '@/engine/format';
import { jobType } from '@/engine/jobTypes';
import { learnFromQuotes, learnFromWork } from '@/engine/learned';
import type { Estimate, Lang } from '@/engine/types';

import { C, Card, H2, Muted } from './kit';
import { Text } from './text';

/** "What Studwise learned from your quotes": shown on How you work, so the contractor sees what the AI picks up. */
export function LearnedCard({ estimates, lang }: { estimates: Estimate[]; lang: Lang }) {
  const l = learnFromQuotes(estimates, lang);
  const any = l.wording.length || l.exclusions.length || l.priceShifts.length || l.markup !== null || l.permitWording.length;
  const t = learnFromWork(estimates);
  const taught = t.labor.length || t.own.length || t.removed.length || t.added.length;
  const typeName = (id: string) => { try { return jobType(id).name; } catch { return 'Other work'; } };
  return (
    <>
    <Card style={{ gap: 8 }}>
      <H2>What Studwise learned from your work lists</H2>
      {!taught ? (
        <Muted>Studwise writes the work for every job from scratch, and learns from what you change: a labor cost you set, the hours and materials you put on an item, what you take out and what you add. Change the same thing on two jobs and it shows here.</Muted>
      ) : (
        <View style={{ gap: 8 }}>
          <Muted style={{ fontSize: 13 }}>{`From the ${t.jobs} job${t.jobs === 1 ? '' : 's'} Studwise planned for you. Only your own estimates are used.`}</Muted>
          {t.labor.map((x) => <Text key={x.assemblyId} style={{ color: C.ink2 }}>{`Your labor cost for ${x.name}: ${rate(x.rate)} per ${x.unit} (${x.times} jobs)`}</Text>)}
          {t.removed.map((x) => <Text key={`r${x.jobTypeId}${x.name}`} style={{ color: C.ink2 }}>{`You take out of ${typeName(x.jobTypeId)} jobs: ${x.name} (${x.times} jobs)`}</Text>)}
          {t.added.map((x) => <Text key={`a${x.jobTypeId}${x.name}`} style={{ color: C.ink2 }}>{`You add to ${typeName(x.jobTypeId)} jobs: ${x.name} (${x.times} jobs)`}</Text>)}
          {t.own.length ? <Text style={{ color: C.ink, fontWeight: '600', marginTop: 4 }}>Your own items</Text> : null}
          {t.own.slice(0, 8).map((x) => <Text raw key={x.name} style={{ color: C.ink2, fontSize: 14 }}>{`• ${x.name}: ${x.hours} hr + ${rate(x.materials)} / ${x.unit}`}</Text>)}
        </View>
      )}
    </Card>
    <Card style={{ gap: 8 }}>
      <H2>What Studwise learned from your quotes</H2>
      {!any ? (
        <Muted>Every quote you send teaches Studwise your wording, what you always leave out and how you price. Send a few quotes and it shows here.</Muted>
      ) : (
        <View style={{ gap: 8 }}>
          <Muted style={{ fontSize: 13 }}>{`From ${l.quotes} quote${l.quotes === 1 ? '' : 's'} you sent. Studwise uses this when it writes scopes, notes and permit descriptions.`}</Muted>
          {l.markup !== null ? <Text style={{ color: C.ink2 }}>{`Your usual markup: ${l.markup}%`}</Text> : null}
          {l.priceShifts.map((s) => (
            <Text key={s.section} style={{ color: C.ink2 }}>{`You price ${s.section} ${Math.abs(s.pct)}% ${s.pct > 0 ? 'above' : 'below'} Studwise (${s.times} quotes)`}</Text>
          ))}
          {l.exclusions.length ? <Text style={{ color: C.ink, fontWeight: '600', marginTop: 4 }}>You usually leave out</Text> : null}
          {l.exclusions.slice(0, 5).map((x) => <Text raw key={x} style={{ color: C.ink2, fontSize: 14 }}>• {x}</Text>)}
          {l.wording.length ? <Text style={{ color: C.ink, fontWeight: '600', marginTop: 4 }}>Your wording</Text> : null}
          {l.wording.slice(0, 4).map((x) => <Text raw key={x} style={{ color: C.ink2, fontSize: 14, fontStyle: 'italic' }}>“{x}”</Text>)}
        </View>
      )}
    </Card>
    </>
  );
}
