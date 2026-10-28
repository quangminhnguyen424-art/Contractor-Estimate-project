import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';

import { TRADE_NAMES } from '@/engine/catalog';
import { money, qtyFmt } from '@/engine/format';
import { FINISH_LABELS, JOB_TYPE_BY_ID } from '@/engine/jobTypes';
import type { EstimateStatus, Trade } from '@/engine/types';
import { useApp } from '@/store/AppContext';
import { Banner, Button, C, Card, Chip, H2, Muted, Row, Screen, Stepper, mono } from '@/ui/kit';
import { confirmAction } from '@/ui/notify';

export default function EstimateScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { estimates, updateEstimate, deleteEstimate, setDraft, profile } = useApp();
  const [open, setOpen] = useState<Trade | null>(null);
  const [okToRepriceSent, setOkToRepriceSent] = useState(false);
  const est = estimates.find((e) => e.id === id);

  if (!est || !profile) {
    return (
      <Screen>
        <Muted>This estimate was deleted.</Muted>
        <Button title="Back to jobs" onPress={() => router.replace('/')} />
      </Screen>
    );
  }
  const jt = JOB_TYPE_BY_ID[est.jobTypeId];
  const warns = est.checks.filter((c) => c.level === 'warn');
  const infos = est.checks.filter((c) => c.level === 'info');
  const cmp = est.comparison;

  const edit = () => {
    setDraft({
      id: est.id, jobTypeId: est.jobTypeId, mode: est.mode, title: est.title, clientName: est.clientName, address: est.address,
      description: est.description, scopeNote: est.scopeNote ?? '', aiNotes: est.aiNotes ?? [], photos: est.photos, finish: est.finish, answers: est.answers, customItems: est.customItems,
      heard: [], markupPct: est.markupPct,
    });
    router.push('/questions');
  };

  const changeMarkup = (n: number) => {
    const go = () => updateEstimate(est.id, { markupPct: n });
    if (est.status === 'draft' || okToRepriceSent) return go();
    // Ask once per visit, not on every tap of the stepper.
    confirmAction('Change the price on a sent quote?', 'The client already has this quote. Changing markup changes the price.', 'Change', () => {
      setOkToRepriceSent(true);
      go();
    });
  };

  const remove = () => {
    confirmAction('Delete estimate?', 'This cannot be undone.', 'Delete', () => { deleteEstimate(est.id); router.replace('/'); });
  };

  return (
    <Screen
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {est.mode === 'detailed' ? (
            <Button kind="secondary" title="Materials" style={{ flex: 1 }} onPress={() => router.push(`/estimate/${est.id}/materials`)} />
          ) : null}
          <Button title="Client quote" style={{ flex: 1 }} onPress={() => router.push(`/estimate/${est.id}/quote`)} />
        </View>
      }>
      <Stack.Screen options={{ title: est.status === 'draft' ? 'Estimate (internal)' : 'Estimate' }} />
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 22, fontWeight: '700', color: C.ink }}>{est.title}</Text>
        <Muted>{jt.name} · {FINISH_LABELS[est.finish].en} · {est.mode === 'quick' ? 'Quick' : 'Detailed'}</Muted>
        <Muted style={{ fontSize: 12 }}>Internal view. Your client never sees cost, labor or markup.</Muted>
      </View>

      <View style={{ backgroundColor: C.dark, borderRadius: 16, padding: 18, gap: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text style={{ color: C.darkMuted, fontSize: 14 }}>Client price</Text>
          <Text style={{ color: '#fff', fontSize: 30, fontFamily: mono, fontWeight: '600' }}>{money(est.price)}</Text>
        </View>
        {est.mode === 'quick' ? (
          <View style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: '#3A3F45', paddingTop: 12, gap: 8 }}>
            <DarkStat label="Size" value={`${cmp.sizeSf} SF`} />
            <DarkStat label="Your price" value={`${money(cmp.pricePerSf)}/SF`} accent />
          </View>
        ) : (
          <View style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: '#3A3F45', paddingTop: 12, gap: 8 }}>
            <DarkStat label="Labor" value={money(est.laborTotal)} />
            <DarkStat label="Materials" value={money(est.materialTotal)} />
            <DarkStat label={`Markup ${est.markupPct}%`} value={money(est.markup)} accent />
          </View>
        )}
        <Text style={{ color: C.darkMuted, fontSize: 13 }}>+ {est.salesTaxPct}% sales tax {money(est.tax)} = {money(est.total)} total</Text>
      </View>

      {est.mode === 'detailed' ? (
        <Card>
          <Stepper label={`Markup ${est.markupPct}%`} value={est.markupPct} onChange={changeMarkup} />
          <Muted style={{ fontSize: 13 }}>Your minimum is {profile.minMarkupPct}%. Changing markup keeps your saved costs and tax rate.</Muted>
        </Card>
      ) : (
        <Muted style={{ fontSize: 13 }}>Quick estimates use your price per SF. Change it in Pricing, or switch to Detailed for markup and a trade breakdown.</Muted>
      )}

      <Banner
        tone={cmp.flag === 'ok' ? 'ok' : cmp.flag === 'none' ? 'info' : 'warn'}
        title={cmp.pricePerSf > 0 ? `${money(cmp.pricePerSf)}/SF on ${cmp.sizeSf} SF` : 'Your price check'}>
        {cmp.message}
      </Banner>

      {warns.length > 0 || infos.length > 0 ? (
        <Card style={{ backgroundColor: warns.length ? C.warnBg : C.card, borderColor: warns.length ? C.warnBg : C.line }}>
          <Text style={{ fontWeight: '700', fontSize: 15, color: warns.length ? C.warnInk : C.ink }}>
            Check before sending{warns.length ? ` · ${warns.length} to fix` : ''}
          </Text>
          {[...warns, ...infos].map((c) => (
            <View key={c.id} style={{ flexDirection: 'row', gap: 8 }}>
              <Text style={{ color: c.level === 'warn' ? '#B54708' : C.infoInk, fontWeight: '700' }}>{c.level === 'warn' ? '!' : 'i'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600', color: C.ink }}>{c.title}</Text>
                <Text style={{ color: C.ink2, fontSize: 13, lineHeight: 18 }}>{c.detail}</Text>
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      {est.aiNotes && est.aiNotes.length > 0 ? (
        <Card style={{ backgroundColor: C.infoBg, borderColor: C.infoBg }}>
          <Text style={{ fontWeight: '700', fontSize: 15, color: C.infoInk }}>Claude noticed (from notes and photos)</Text>
          {est.aiNotes.map((n, i) => <Text key={i} style={{ color: C.infoInk, fontSize: 13, lineHeight: 19 }}>• {n}</Text>)}
        </Card>
      ) : null}

      {est.mode === 'detailed' ? (
        <Card style={{ paddingVertical: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: C.muted }}>TRADE</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: C.muted }}>YOUR COST</Text>
          </View>
          {est.trades.map((t) => (
            <View key={t.trade}>
              <Row left={TRADE_NAMES[t.trade].en} right={money(t.cost)} sub={`Labor ${money(t.labor)} · Materials ${money(t.materials)}`}
                onPress={() => setOpen(open === t.trade ? null : t.trade)} />
              {open === t.trade
                ? est.lines.filter((l) => l.trade === t.trade).map((l) => (
                    <Row key={l.assemblyId} left={`  ${l.name}`} sub={`  ${qtyFmt(l.qty)} ${l.unit} × ${money(l.laborUnit)} labor`} right={money(l.labor + l.materials)} />
                  ))
                : null}
            </View>
          ))}
          <Row left="Total cost" right={money(est.cost)} bold />
        </Card>
      ) : null}

      {est.photos.length > 0 ? (
        <ScrollView horizontal contentContainerStyle={{ gap: 6 }}>
          {est.photos.map((uri) => <Image key={uri} source={{ uri }} style={{ width: 90, height: 90, borderRadius: 8 }} />)}
        </ScrollView>
      ) : null}

      <H2>Status</H2>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {(['draft', 'sent', 'won', 'lost'] as EstimateStatus[]).map((st) => (
          <Chip key={st} label={st[0].toUpperCase() + st.slice(1)} selected={est.status === st} onPress={() => updateEstimate(est.id, { status: st })} />
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button kind="secondary" title="Edit answers" style={{ flex: 1 }} onPress={edit} />
      </View>
      <Pressable accessibilityRole="button" onPress={remove} style={{ alignSelf: 'center', padding: 12 }}>
        <Text style={{ color: '#B42318', fontWeight: '600' }}>Delete estimate</Text>
      </Pressable>
    </Screen>
  );
}

function DarkStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={{ color: C.darkMuted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: accent ? '#FDBA8C' : '#fff', fontFamily: mono, fontSize: 15 }}>{value}</Text>
    </View>
  );
}
