import { View } from 'react-native';

import { learnFromQuotes } from '@/engine/learned';
import type { Estimate, Lang } from '@/engine/types';

import { C, Card, H2, Muted } from './kit';
import { Text } from './text';

/** "What Studwise learned from your quotes": shown on How you work, so the contractor sees what the AI picks up. */
export function LearnedCard({ estimates, lang }: { estimates: Estimate[]; lang: Lang }) {
  const l = learnFromQuotes(estimates, lang);
  const any = l.wording.length || l.exclusions.length || l.priceShifts.length || l.markup !== null || l.permitWording.length;
  return (
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
  );
}
