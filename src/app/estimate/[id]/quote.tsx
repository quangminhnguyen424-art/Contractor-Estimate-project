import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, Pressable, useWindowDimensions, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { Text } from '@/ui/text';
import { planSvg, planTotals } from '@/engine/floorplan';
import { dateFmt, money } from '@/engine/format';
import { FINISH_LABELS } from '@/engine/jobTypes';
import { acceptedBlock, changedSinceSigned } from '@/engine/contract';
import { baseSections, QUOTE_TEXT, quoteHtml, quoteSections, quoteWording, quoteWritePrompt, scheduleAmounts, type QuoteWriteTarget } from '@/engine/quote';
import { aiFor } from '@/ui/host';
import { ActionSheet } from '@/ui/Sheet';
import { useCloud } from '@/cloud/CloudProvider';
import { createSignLink } from '@/cloud/sign';
import type { Estimate, Lang, Profile, QuoteEdits, QuoteWording } from '@/engine/types';
import { useApp } from '@/store/AppContext';
import { Banner, Button, C, Card, Field, H2, Muted, NumberField, P, Screen, Segmented, mono } from '@/ui/kit';
import { confirmAction, notify } from '@/ui/notify';
import { sharePdf } from '@/ui/share';

export default function QuoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { estimates, profile, updateEstimate, contracts } = useApp();
  const est = estimates.find((e) => e.id === id);
  const [lang, setLang] = useState<Lang>(profile?.quoteLanguage ?? 'en');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  const cloud = useCloud();
  const { width } = useWindowDimensions();
  const planWidth = Math.min(width, 760) - 80;
  if (!est || !profile) return <Screen><Muted>Estimate not found.</Muted></Screen>;

  const T = QUOTE_TEXT[lang];
  const sections = quoteSections(est, lang);
  const sched = scheduleAmounts(est, profile);
  const wd = quoteWording(est, profile, lang);
  const excl = wd.exclusions;
  const isSigned = contracts.some((c) => c.estimateId === est.id && c.accepted);
  const blocking = est.checks.filter((c) => c.level === 'warn');

  // Text or email the client a link to read and sign on their own phone (the PDF is inside the link).
  const sendLink = async (via: 'sms' | 'email') => {
    if (!cloud.user) { router.push('/login'); return; }
    setBusy(true);
    try {
      const link = await createSignLink({
        uid: cloud.user.id, kind: 'quote', estimateId: est.id, title: est.title, company: profile.companyName,
        clientName: est.clientName, total: est.total, html: quoteHtml(est, profile, lang),
        phone: profile.phone, email: profile.email, payLink: profile.payLink,
      });
      const msg = lang === 'vi'
        ? `${profile.companyName}: báo giá cho ${est.title} đã sẵn sàng. Mời anh/chị xem và ký tại đây: ${link}`
        : `${profile.companyName}: your quote for ${est.title} is ready. Please review and sign here: ${link}`;
      if (via === 'sms') await Linking.openURL(Platform.OS === 'ios' ? `sms:&body=${encodeURIComponent(msg)}` : `sms:?body=${encodeURIComponent(msg)}`);
      else await Linking.openURL(`mailto:?subject=${encodeURIComponent(`${T.quote}: ${est.title}`)}&body=${encodeURIComponent(msg)}`);
      if (est.status === 'draft') updateEstimate(est.id, { status: 'sent' });
    } catch (e) {
      notify('Could not make the link', e instanceof Error ? e.message : 'Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    setBusy(true);
    try {
      const c = contracts.find((x) => x.estimateId === est.id);
      const signed = c?.accepted;
      // A signed quote is shared exactly as signed. If the estimate changed since, share it unsigned.
      const html = signed && !changedSinceSigned(est, c)
        ? signed.html?.[lang] ?? quoteHtml(est, profile, lang, acceptedBlock(signed, profile, lang))
        : quoteHtml(est, profile, lang);
      if (signed && changedSinceSigned(est, c)) notify('Shared without the signature', 'The quote changed after the client signed, so this copy is unsigned. Have them sign again or use a change order.');
      const shared = await sharePdf(html, `${T.quote} — ${est.title}`);
      if (shared && est.status === 'draft') updateEstimate(est.id, { status: 'sent' });
    } catch {
      notify('Could not create the PDF', 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen footer={editing ? <Button title="Done editing" icon="checkmark" onPress={() => setEditing(false)} /> : (
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text style={{ color: C.ink2, fontSize: 15 }}>Total amount</Text>
          <Text style={{ color: C.ink, fontSize: 20, fontWeight: '700' }}>{money(est.total)}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button kind="secondary" title="Edit" icon="create-outline" style={{ flex: 1 }} onPress={() => setEditing(true)} />
          <Button kind="secondary" title={isSigned ? 'Signed ✓' : 'Sign'} icon="pencil" style={{ flex: 1 }}
            onPress={() => router.push(`/estimate/${est.id}/sign`)} />
          <Button title={busy ? '…' : 'Send'} icon="paper-plane-outline" disabled={busy} style={{ flex: 1.3 }} onPress={() => setMenu(true)} />
        </View>
      </View>
    )}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={{ flex: 1, color: C.ink, fontSize: 20, fontWeight: '700' }}>{editing ? 'Edit your quote' : 'Your quote is ready'}</Text>
      </View>
      <Segmented<Lang> value={lang} onChange={setLang} options={[{ value: 'en', label: 'English' }, { value: 'vi', label: 'Tiếng Việt' }]} />
      {editing ? (
        <QuoteEditor key={lang} est={est} lang={lang} profile={profile} signed={isSigned}
          onSave={(q) => { updateEstimate(est.id, { quoteEdits: q }); if (!q) setEditing(false); }} onPrice={() => router.back()} />
      ) : null}
      <ActionSheet visible={menu} onClose={() => setMenu(false)} title="Send the quote" actions={[
        { icon: 'chatbubble-ellipses', label: 'Text a link to sign', sub: 'The client reads and signs on their phone. You are told when they sign.', onPress: () => sendLink('sms') },
        { icon: 'mail', label: 'Email a link to sign', onPress: () => sendLink('email') },
        { icon: 'document-attach', label: 'Share the PDF', sub: 'Email, text, AirDrop or save', onPress: send },
      ]} />
      {editing ? null : <>
      {blocking.length > 0 ? (
        <Banner tone="warn" title={`${blocking.length} item${blocking.length > 1 ? 's' : ''} to review before sending`}>
          {blocking.map((b) => b.title).join(' · ')}
          {'  '}
          <Text style={{ fontWeight: '700', textDecorationLine: 'underline' }} onPress={() => router.back()}>Review</Text>
        </Banner>
      ) : null}

      <View style={{ backgroundColor: P.paper, borderRadius: 14, padding: 20, gap: 14, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 2 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 2, borderColor: P.accent, paddingBottom: 10 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: P.ink }}>{profile.companyName}</Text>
            <Text style={{ fontSize: 12, color: P.muted }}>{[profile.contactName, profile.phone].filter(Boolean).join(' · ')}</Text>
            {profile.license ? <Text style={{ fontSize: 12, color: P.muted }}>{T.registration} {profile.license}</Text> : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: P.ink }}>{T.quote}</Text>
            <Text style={{ fontSize: 12, color: P.muted }}>{dateFmt(est.updatedAt, lang)}</Text>
            <Text style={{ fontSize: 12, color: P.muted }}>{T.validFor} {wd.validDays} {T.days}</Text>
          </View>
        </View>

        <View style={{ gap: 2 }}>
          <Text style={{ fontSize: 12, color: P.muted }}>{T.preparedFor}</Text>
          <Text style={{ fontWeight: '600', color: P.ink }}>{est.clientName || '—'}{est.address ? ` · ${est.address}` : ''}</Text>
        </View>
        <View style={{ gap: 2 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: P.ink }}>{est.title}</Text>
          <Text style={{ fontSize: 13, color: P.ink2 }}>{T.finish}: {FINISH_LABELS[est.finish][lang]}</Text>
          {wd.scopeNote.trim() ? <Text style={{ fontSize: 13, color: P.ink2, lineHeight: 19 }}>{wd.scopeNote}</Text> : null}
        </View>

        <View>
          {sections.map((s) => (
            <View key={s.trade} style={{ paddingVertical: 8, borderBottomWidth: 1, borderColor: P.line, gap: 2 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Text style={{ fontWeight: '600', color: P.ink, flex: 1 }}>{s.title}</Text>
                {wd.byTotal ? null : <Text style={{ fontFamily: mono, color: P.ink }}>{money(s.price)}</Text>}
              </View>
              {s.items.map((i, k) => <Text key={k} style={{ fontSize: 12, color: P.muted }}>• {i}</Text>)}
            </View>
          ))}
          <Line l={T.subtotal} r={money(est.price)} />
          <Line l={`${T.tax} (${est.salesTaxPct}%)`} r={money(est.tax)} />
          <Line l={T.total} r={money(est.total)} big />
        </View>

        {est.plan?.length ? (
          <View style={{ gap: 4 }}>
            <Text style={{ fontWeight: '700', color: P.ink }}>{T.plan}</Text>
            <Text style={{ fontSize: 12, color: P.ink2 }}>{T.planNote}: {planTotals(est.plan).floorSf} SF</Text>
            <SvgXml xml={planSvg(est.plan, planWidth)} width={planWidth} />
          </View>
        ) : null}

        <View style={{ gap: 2 }}>
          <Text style={{ fontWeight: '700', color: P.ink }}>{T.notIncluded}</Text>
          {excl.map((e, k) => <Text key={k} style={{ fontSize: 12, color: P.ink2 }}>• {e}</Text>)}
        </View>
        {wd.notes ? (
          <View style={{ gap: 2 }}>
            <Text style={{ fontWeight: '700', color: P.ink }}>{lang === 'vi' ? 'Ghi chú' : 'Notes'}</Text>
            <Text style={{ fontSize: 12, color: P.ink2, lineHeight: 18 }}>{wd.notes}</Text>
          </View>
        ) : null}
        <View style={{ gap: 2 }}>
          <Text style={{ fontWeight: '700', color: P.ink }}>{T.schedule}</Text>
          {sched.map((s, k) => <Line key={k} l={`${s.label} (${s.pct}%)`} r={money(s.amount)} />)}
        </View>
      </View>
      <Muted style={{ fontSize: 13 }}>Tap Edit to change the wording, Sign to have the client sign on this phone, or Share to send the PDF by text or email. Sharing marks the estimate as Sent.</Muted>
      </>}
    </Screen>
  );
}

function Line({ l, r, big }: { l: string; r: string; big?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 }}>
      <Text style={{ color: P.ink, fontSize: big ? 16 : 13, fontWeight: big ? '700' : '400', flex: 1 }}>{l}</Text>
      <Text style={{ color: P.ink, fontFamily: mono, fontSize: big ? 16 : 13, fontWeight: big ? '700' : '400' }}>{r}</Text>
    </View>
  );
}

const lines = (t: string) => t.split('\n').map((x) => x.replace(/^\s*[•\-*]\s*/, '').trim()).filter(Boolean);

/** The contractor's editor: wording per section, scope note, what's not included, notes, valid days and how prices show.
 *  Prices themselves come from the estimate (markup and your items), so the total always matches the job's numbers. */
function QuoteEditor({ est, lang, profile, signed, onSave, onPrice }: {
  est: Estimate; lang: Lang; profile: Profile; signed: boolean;
  onSave: (q: QuoteEdits | null) => void; onPrice: () => void;
}) {
  const base = baseSections(est, lang);
  const shown = quoteSections(est, lang);
  const wd = quoteWording(est, profile, lang);
  const validDefault = profile.quoteValidDays;
  const [w, setW] = useState<QuoteWording>(() => est.quoteEdits?.[lang] ?? {});
  const [secText, setSecText] = useState<Record<string, { title: string; items: string }>>(() =>
    Object.fromEntries(shown.map((s) => [s.trade, { title: s.title, items: s.items.join('\n') }])));
  const [days, setDays] = useState(wd.validDays);
  const [byTotal, setByTotal] = useState(wd.byTotal);

  const save = (next: { w?: QuoteWording; sec?: typeof secText; days?: number; byTotal?: boolean }) => {
    const sec = next.sec ?? secText;
    const sections: NonNullable<QuoteWording['sections']> = {};
    for (const b of base) {
      const t = sec[b.trade];
      if (!t) continue;
      const items = lines(t.items);
      const sameTitle = t.title.trim() === b.title;
      const sameItems = items.join('\n') === b.items.join('\n');
      if (!sameTitle || !sameItems) sections[b.trade] = { title: sameTitle ? undefined : t.title.trim(), items: sameItems ? undefined : items };
    }
    const wording: QuoteWording = { ...(next.w ?? w), sections };
    const d = next.days ?? days;
    const bt = next.byTotal ?? byTotal;
    const q: QuoteEdits = { ...est.quoteEdits, [lang]: wording, validDays: d === validDefault ? undefined : d, prices: bt ? 'total' : 'sections' };
    onSave(q);
  };
  const setWord = (patch: Partial<QuoteWording>) => { const n = { ...w, ...patch }; setW(n); save({ w: n }); };

  return (
    <View style={{ gap: 12 }}>
      {signed ? <Banner tone="info" title="The client already signed. The signed copy stays as signed; edits change only new copies." /> : null}
      <Muted style={{ fontSize: 13 }}>Editing the {lang === 'vi' ? 'Vietnamese' : 'English'} quote. Changes save as you type. Prices come from the estimate.</Muted>
      <Card>
        <H2>Scope of work</H2>
        <Field label="Scope summary (shown under the title)" value={w.scopeNote ?? est.scopeNote ?? ''} multiline
          onChangeText={(v) => setWord({ scopeNote: v })} />
        <HelpWrite est={est} lang={lang} target={{ kind: 'scope' }} draft={w.scopeNote ?? est.scopeNote ?? ''} onText={(t) => setWord({ scopeNote: t })} />
        {shown.map((s) => {
          const t = secText[s.trade] ?? { title: s.title, items: s.items.join('\n') };
          const upd = (patch: Partial<typeof t>) => { const n = { ...secText, [s.trade]: { ...t, ...patch } }; setSecText(n); save({ sec: n }); };
          return (
            <View key={s.trade} style={{ gap: 8, borderTopWidth: 1, borderColor: C.lineSoft, paddingTop: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Muted style={{ fontSize: 12 }}>Section</Muted>
                <Text style={{ color: C.ink2, fontFamily: mono, fontSize: 13 }}>{money(s.price)}</Text>
              </View>
              <Field label="Heading" value={t.title} onChangeText={(v) => upd({ title: v })} maxLength={120} />
              <Field label="What's included (one line each)" value={t.items} onChangeText={(v) => upd({ items: v })} multiline />
              <HelpWrite est={est} lang={lang} target={{ kind: 'section', trade: s.trade }} draft={t.items} onText={(v) => upd({ items: v })} />
            </View>
          );
        })}
      </Card>
      <Card>
        <H2>Not included</H2>
        <Field label="One line each" multiline value={(w.exclusions ?? wd.exclusions).join('\n')}
          onChangeText={(v) => setWord({ exclusions: v.split('\n') })} />
      </Card>
      <Card>
        <H2>Notes for the client</H2>
        <Field label="Optional: allowances, timing, access, cleanup…" multiline value={w.notes ?? ''} onChangeText={(v) => setWord({ notes: v })} />
        <HelpWrite est={est} lang={lang} target={{ kind: 'notes' }} draft={w.notes ?? ''} onText={(t) => setWord({ notes: t })} />
      </Card>
      <Card>
        <H2>Prices and dates</H2>
        <Segmented<'sections' | 'total'> value={byTotal ? 'total' : 'sections'}
          onChange={(v) => { setByTotal(v === 'total'); save({ byTotal: v === 'total' }); }}
          options={[{ value: 'sections', label: 'Price per section' }, { value: 'total', label: 'One total only' }]} />
        <NumberField label="Quote valid for" suffix="days" decimals={false} value={days} onChange={(v) => { setDays(v); save({ days: v }); }} />
        <Button kind="secondary" icon="calculator-outline" title="Change the price (markup or your items)" onPress={onPrice} />
      </Card>
      {est.quoteEdits ? (
        <Button kind="secondary" icon="refresh-outline" title="Undo all edits"
          onPress={() => confirmAction('Undo all edits?', 'The quote goes back to the wording Bidwell wrote, in both languages.', 'Undo', () => onSave(null))} />
      ) : null}
    </View>
  );
}

/** "Help me write": the AI drafts this part from the job (or polishes what the contractor typed). The contractor edits after. */
function HelpWrite({ est, lang, target, draft, onText }: { est: Estimate; lang: Lang; target: QuoteWriteTarget; draft: string; onText: (t: string) => void }) {
  const { apiKey, aiAllowed } = useApp();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    setBusy(true); setErr(null);
    try {
      const out = (await aiFor(apiKey, aiAllowed).complete(quoteWritePrompt(est, lang, target, draft), undefined, 600)).trim();
      if (out) onText(out.replace(/^["“]|["”]$/g, '')); else setErr('The AI had nothing to add. Try typing a few words first.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'The AI is not available right now.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 6 }}>
      <Pressable accessibilityRole="button" onPress={run} disabled={busy}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: C.accentTint, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, opacity: busy ? 0.6 : 1 }}>
        <Ionicons name="sparkles" size={16} color={C.accent} />
        <Text style={{ color: C.accent, fontWeight: '600', fontSize: 14 }}>{busy ? 'Writing…' : draft.trim() ? 'Help me write · improve this' : 'Help me write'}</Text>
      </Pressable>
      {err ? <Muted style={{ fontSize: 12, color: C.danger }}>{err}</Muted> : null}
    </View>
  );
}
