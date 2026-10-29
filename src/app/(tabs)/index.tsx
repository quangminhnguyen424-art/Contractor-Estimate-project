import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { money } from '@/engine/format';
import { jobType } from '@/engine/jobTypes';
import type { EstimateStatus } from '@/engine/types';
import { useApp } from '@/store/AppContext';
import { Badge, Banner, Button, C, Chip, H2, Muted, Screen, mono, s } from '@/ui/kit';

const STATUS_TONE = { draft: 'neutral', sent: 'info', won: 'ok', lost: 'bad' } as const;
const STATUS_LABEL: Record<EstimateStatus, string> = { draft: 'Draft', sent: 'Sent', won: 'Won', lost: 'Lost' };

export default function Jobs() {
  const { estimates, profile } = useApp();
  const [filter, setFilter] = useState<'all' | EstimateStatus>('all');
  const shown = useMemo(() => (filter === 'all' ? estimates : estimates.filter((e) => e.status === filter)), [estimates, filter]);
  const needsAttention = estimates.filter((e) => e.status === 'draft' && e.checks.some((c) => c.level === 'warn'));
  const sent = estimates.filter((e) => e.status === 'sent');
  const won = estimates.filter((e) => e.status === 'won');
  const winRate = sent.length + won.length > 0 ? Math.round((won.length / (won.length + sent.length + estimates.filter((e) => e.status === 'lost').length)) * 100) : null;

  return (
    <Screen>
      <Muted>{profile?.companyName}</Muted>
      <Button title="+  New estimate" onPress={() => router.push('/new')} />

      {needsAttention.length > 0 ? (
        <Pressable accessibilityRole="button" onPress={() => router.push(`/estimate/${needsAttention[0].id}`)}>
          <Banner tone="warn" title={`${needsAttention.length} draft${needsAttention.length > 1 ? 's need' : ' needs'} a look before sending`}>
            {needsAttention[0].title}: {needsAttention[0].checks.find((c) => c.level === 'warn')?.title}
          </Banner>
        </Pressable>
      ) : null}

      {estimates.length > 0 ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Stat label="Open quotes" value={money(sent.reduce((t, e) => t + e.price, 0))} />
          <Stat label="Won" value={money(won.reduce((t, e) => t + e.price, 0))} />
          <Stat label="Win rate" value={winRate == null ? '—' : `${winRate}%`} />
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {(['all', 'draft', 'sent', 'won', 'lost'] as const).map((f) => (
          <Chip key={f} label={f === 'all' ? 'All' : STATUS_LABEL[f]} selected={filter === f} onPress={() => setFilter(f)} />
        ))}
      </View>

      {shown.length === 0 ? (
        <View style={[s.card, { alignItems: 'center', paddingVertical: 32 }]}>
          <H2>{estimates.length === 0 ? 'No estimates yet' : 'Nothing here'}</H2>
          <Muted style={{ textAlign: 'center' }}>
            {estimates.length === 0 ? 'Tap New estimate, describe the job by typing or with your keyboard mic, and get a quote in minutes.' : 'Try another filter.'}
          </Muted>
        </View>
      ) : (
        shown.map((e) => (
          <Pressable
            key={e.id}
            accessibilityRole="button"
            onPress={() => router.push(`/estimate/${e.id}`)}
            style={({ pressed }) => [s.card, { opacity: pressed ? 0.8 : 1 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink, flex: 1 }} numberOfLines={1}>{e.title}</Text>
              <Badge label={STATUS_LABEL[e.status]} tone={STATUS_TONE[e.status]} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <Muted style={{ flex: 1 }}>{jobType(e.jobTypeId).name} · {e.mode === 'quick' ? 'Quick' : 'Detailed'}{e.clientName ? ` · ${e.clientName}` : ''}</Muted>
              <Text style={{ fontFamily: mono, color: C.ink, fontSize: 15 }}>{money(e.price)}</Text>
            </View>
          </Pressable>
        ))
      )}
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={[s.card, { flex: 1, padding: 12, gap: 2 }]}>
      <Text style={{ fontSize: 12, color: C.muted }}>{label}</Text>
      <Text style={{ fontSize: 16, fontFamily: mono, color: C.ink, fontWeight: '600' }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}
