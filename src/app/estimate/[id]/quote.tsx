import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { dateFmt, money } from '@/engine/format';
import { FINISH_LABELS, jobType } from '@/engine/jobTypes';
import { QUOTE_TEXT, quoteHtml, quoteSections, scheduleAmounts } from '@/engine/quote';
import type { Lang } from '@/engine/types';
import { useApp } from '@/store/AppContext';
import { Banner, Button, C, Muted, Screen, Segmented, mono } from '@/ui/kit';
import { notify } from '@/ui/notify';
import { sharePdf } from '@/ui/share';

export default function QuoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { estimates, profile, updateEstimate } = useApp();
  const est = estimates.find((e) => e.id === id);
  const [lang, setLang] = useState<Lang>(profile?.quoteLanguage ?? 'en');
  const [busy, setBusy] = useState(false);
  if (!est || !profile) return <Screen><Muted>Estimate not found.</Muted></Screen>;

  const T = QUOTE_TEXT[lang];
  const jt = jobType(est.jobTypeId);
  const sections = quoteSections(est, lang);
  const sched = scheduleAmounts(est, profile);
  const excl = lang === 'vi' ? jt.exclusionsVi : jt.exclusions;
  const blocking = est.checks.filter((c) => c.level === 'warn');

  const send = async () => {
    setBusy(true);
    try {
      const shared = await sharePdf(quoteHtml(est, profile, lang), `${T.quote} — ${est.title}`);
      if (shared && est.status === 'draft') updateEstimate(est.id, { status: 'sent' });
    } catch {
      notify('Could not create the PDF', 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen footer={<Button title={busy ? 'Creating PDF…' : 'Share quote PDF'} disabled={busy} onPress={send} />}>
      <Segmented<Lang> value={lang} onChange={setLang} options={[{ value: 'en', label: 'English' }, { value: 'vi', label: 'Tiếng Việt' }]} />
      {blocking.length > 0 ? (
        <Banner tone="warn" title={`${blocking.length} item${blocking.length > 1 ? 's' : ''} to review before sending`}>
          {blocking.map((b) => b.title).join(' · ')}
          {'  '}
          <Text style={{ fontWeight: '700', textDecorationLine: 'underline' }} onPress={() => router.back()}>Review</Text>
        </Banner>
      ) : null}

      <View style={{ backgroundColor: '#fff', borderRadius: 6, padding: 20, gap: 14, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 2 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 2, borderColor: C.accent, paddingBottom: 10 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: C.ink }}>{profile.companyName}</Text>
            <Text style={{ fontSize: 12, color: C.muted }}>{[profile.contactName, profile.phone].filter(Boolean).join(' · ')}</Text>
            {profile.license ? <Text style={{ fontSize: 12, color: C.muted }}>{T.registration} {profile.license}</Text> : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: C.ink }}>{T.quote}</Text>
            <Text style={{ fontSize: 12, color: C.muted }}>{dateFmt(est.updatedAt, lang)}</Text>
            <Text style={{ fontSize: 12, color: C.muted }}>{T.validFor} {profile.quoteValidDays} {T.days}</Text>
          </View>
        </View>

        <View style={{ gap: 2 }}>
          <Text style={{ fontSize: 12, color: C.muted }}>{T.preparedFor}</Text>
          <Text style={{ fontWeight: '600', color: C.ink }}>{est.clientName || '—'}{est.address ? ` · ${est.address}` : ''}</Text>
        </View>
        <View style={{ gap: 2 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: C.ink }}>{est.title}</Text>
          <Text style={{ fontSize: 13, color: C.ink2 }}>{T.finish}: {FINISH_LABELS[est.finish][lang]}</Text>
          {est.scopeNote ? <Text style={{ fontSize: 13, color: C.ink2, lineHeight: 19 }}>{est.scopeNote}</Text> : null}
        </View>

        <View>
          {sections.map((s) => (
            <View key={s.trade} style={{ paddingVertical: 8, borderBottomWidth: 1, borderColor: C.lineSoft, gap: 2 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Text style={{ fontWeight: '600', color: C.ink, flex: 1 }}>{s.title}</Text>
                <Text style={{ fontFamily: mono, color: C.ink }}>{money(s.price)}</Text>
              </View>
              {s.items.map((i, k) => <Text key={k} style={{ fontSize: 12, color: C.muted }}>• {i}</Text>)}
            </View>
          ))}
          <Line l={T.subtotal} r={money(est.price)} />
          <Line l={`${T.tax} (${est.salesTaxPct}%)`} r={money(est.tax)} />
          <Line l={T.total} r={money(est.total)} big />
        </View>

        <View style={{ gap: 2 }}>
          <Text style={{ fontWeight: '700', color: C.ink }}>{T.notIncluded}</Text>
          {excl.map((e, k) => <Text key={k} style={{ fontSize: 12, color: C.ink2 }}>• {e}</Text>)}
        </View>
        <View style={{ gap: 2 }}>
          <Text style={{ fontWeight: '700', color: C.ink }}>{T.schedule}</Text>
          {sched.map((s, k) => <Line key={k} l={`${s.label} (${s.pct}%)`} r={money(s.amount)} />)}
        </View>
      </View>
      <Muted style={{ fontSize: 13 }}>Sharing marks the estimate as Sent. The PDF also includes terms and signature lines.</Muted>
    </Screen>
  );
}

function Line({ l, r, big }: { l: string; r: string; big?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 }}>
      <Text style={{ color: C.ink, fontSize: big ? 16 : 13, fontWeight: big ? '700' : '400', flex: 1 }}>{l}</Text>
      <Text style={{ color: C.ink, fontFamily: mono, fontSize: big ? 16 : 13, fontWeight: big ? '700' : '400' }}>{r}</Text>
    </View>
  );
}
