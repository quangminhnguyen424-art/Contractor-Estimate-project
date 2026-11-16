import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, Pressable, Share, useWindowDimensions, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { Text, Untranslated } from '@/ui/text';
import { planSvg, planTotals } from '@/engine/floorplan';
import { dateFmt, money } from '@/engine/format';
import { FINISH_LABELS } from '@/engine/jobTypes';
import { changedSinceSigned } from '@/engine/contract';
import { baseSections, QUOTE_TEXT, quoteHtml, quoteSections, quoteWording, quoteWritePrompt, scheduleAmounts, stepName, type QuoteWriteTarget } from '@/engine/quote';
import { aiFor } from '@/ui/host';
import { ActionSheet, Sheet } from '@/ui/Sheet';
import { useCloud } from '@/cloud/CloudProvider';
import { createSignLink } from '@/cloud/sign';
import type { Estimate, Lang, Profile, QuoteEdits, QuoteWording } from '@/engine/types';
import { useApp } from '@/store/AppContext';
import { ClientLanguage, signedQuoteHtml, translateFailed, useClientDocs } from '@/ui/ClientLanguage';
import { Banner, Button, C, Card, Field, H2, Muted, NumberField, P, Screen, Segmented, mono } from '@/ui/kit';
import { confirmAction, notify } from '@/ui/notify';
import { sharePdf } from '@/ui/share';
import { useWritingScope, writeScope } from '@/ui/writeScope';

export default function QuoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const app = useApp();
  const { estimates, profile, updateEstimate, contracts } = app;
  const scopeBusy = useWritingScope(id);
  const est = estimates.find((e) => e.id === id);
  const docs = useClientDocs(est);
  const lang = docs.lang;
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  // Tap a part of the draft to change it right there: a section, the scope summary, Not included or the notes.
  const [part, setPart] = useState<Part | null>(null);
  const cloud = useCloud();
  const { width } = useWindowDimensions();
  const planWidth = Math.min(width, 760) - 80;
  if (!est || !profile) return <Screen><Muted>Estimate not found.</Muted></Screen>;

  const T = QUOTE_TEXT[lang];
  const sections = quoteSections(est, lang);
  // A signed job keeps the schedule it was signed with, whatever Settings says today.
  const sched = (contracts.find((x) => x.estimateId === est.id)?.terms?.schedule ?? scheduleAmounts(est, profile)).filter((s) => s.pct > 0);
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
        clientName: est.clientName, total: est.total, html: await docs.doc(quoteHtml(est, profile, lang)),
        phone: profile.phone, email: profile.email, payLink: profile.payLink,
      });
      const msg = lang === 'vi'
        ? `${profile.companyName}: báo giá cho ${est.title} đã sẵn sàng. Mời anh/chị xem và ký tại đây: ${link}`
        : await docs.message('{0}: your quote for {1} is ready. Please review and sign here: {2}', profile.companyName, est.title, link);
      const subject = docs.target ? await docs.message('Quote: {0}', est.title) : `${T.quote}: ${est.title}`;
      const url = via === 'sms' ? (Platform.OS === 'ios' ? `sms:&body=${encodeURIComponent(msg)}` : `sms:?body=${encodeURIComponent(msg)}`) : `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(msg)}`;
      // No Messages or Mail set up on this phone: the link is made, so offer every other way to send it.
      await Linking.openURL(url).catch(() => Share.share({ message: msg }));
      if (est.status === 'draft') updateEstimate(est.id, { status: 'sent' });
    } catch (e) {
      if (!translateFailed(e, docs.target)) notify('Could not make the link', e instanceof Error ? e.message : 'Check your connection and try again.');
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
      const asSigned = signed && !changedSinceSigned(est, c);
      const html = asSigned ? await signedQuoteHtml(est, profile, signed, docs, c?.terms?.schedule) : await docs.doc(quoteHtml(est, profile, lang));
      if (signed && changedSinceSigned(est, c)) notify('Shared without the signature', 'The quote changed after the client signed, so this copy is unsigned. Have them sign again or use a change order.');
      const shared = await sharePdf(html, `${T.quote} — ${est.title}`);
      if (shared && est.status === 'draft') updateEstimate(est.id, { status: 'sent' });
    } catch (e) {
      if (!translateFailed(e, docs.target)) notify('Could not create the PDF', 'Please try again.');
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
          <Button title={busy ? (docs.target ? 'Translating…' : '…') : 'Send'} icon="paper-plane-outline" disabled={busy} style={{ flex: 1.3 }} onPress={() => setMenu(true)} />
        </View>
      </View>
    )}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={{ flex: 1, color: C.ink, fontSize: 20, fontWeight: '700' }}>{editing ? 'Edit your quote' : 'Your quote is ready'}</Text>
      </View>
      <ClientLanguage est={est} />
      <PartSheet est={est} profile={profile} lang={lang} signed={isSigned} part={part} onClose={() => setPart(null)} />
      {editing ? (
        <QuoteEditor key={lang} est={est} lang={lang} profile={profile} signed={isSigned}
          onSave={(q) => { updateEstimate(est.id, { quoteEdits: q }); if (!q) setEditing(false); }} onPrice={() => router.dismissTo(`/estimate/${est.id}`)}
          onSectionPrice={(trade) => setPart({ kind: 'section', trade })} />
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
          <Text style={{ fontWeight: '700', textDecorationLine: 'underline' }} onPress={() => router.dismissTo(`/estimate/${est.id}`)}>Review</Text>
        </Banner>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.accentTint, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}>
        <Ionicons name="hand-left-outline" size={18} color={C.accent} />
        <Text style={{ flex: 1, color: C.accentDark, fontSize: 14 }}>Tap any part of the quote to change its wording or price.</Text>
      </View>
      {scopeBusy ? (
        <Banner tone="info" title="Bidwell is writing the scope of work…">It fills in every section from your notes and photos. You can keep reading; the quote updates when it is done.</Banner>
      ) : isSigned ? null : (
        <Button kind="secondary" icon="sparkles" title={est.quoteEdits?.[lang] ? 'Rewrite the whole scope with Bidwell' : 'Write the whole scope with Bidwell'}
          onPress={() => {
            const go = () => writeScope(est.id, lang, app).catch((e: unknown) => notify('Bidwell could not write the scope', e instanceof Error ? e.message : 'Try again.'));
            if (est.quoteEdits?.[lang]) confirmAction('Rewrite the whole scope?', 'Bidwell writes the summary, every section and Not included again from your notes. Your notes for the client and your prices stay.', 'Rewrite', go);
            else void go();
          }} />
      )}

      <Untranslated>
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
          <Tappable label="Edit the scope summary" onPress={() => setPart({ kind: 'scope' })}>
            {wd.scopeNote.trim() ? <Text style={{ fontSize: 13, color: P.ink2, lineHeight: 19 }}>{wd.scopeNote} <Ionicons name="pencil" size={11} color={C.accent} /></Text> : <AddLine text={lang === 'vi' ? '+ Tóm tắt phạm vi công việc' : '+ Add a scope summary'} />}
          </Tappable>
        </View>

        <View>
          {sections.map((s) => (
            <Tappable key={s.trade} label={`Edit ${s.title}`} onPress={() => setPart({ kind: 'section', trade: s.trade })}
              style={{ paddingVertical: 8, borderBottomWidth: 1, borderColor: P.line, gap: 2 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ fontWeight: '600', color: P.ink, flexShrink: 1 }}>{s.title}</Text>
                  <Pen />
                </View>
                {wd.byTotal ? null : <Text style={{ fontFamily: mono, color: est.priceEdits?.[s.trade] ? P.accent : P.ink }}>{money(s.price)}</Text>}
              </View>
              {s.items.map((i, k) => <Text key={k} style={{ fontSize: 12, color: P.muted }}>• {i}</Text>)}
            </Tappable>
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

        <Tappable label="Edit what is not included" onPress={() => setPart({ kind: 'exclusions' })} style={{ gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontWeight: '700', color: P.ink }}>{T.notIncluded}</Text>
            <Pen />
          </View>
          {excl.map((e, k) => <Text key={k} style={{ fontSize: 12, color: P.ink2 }}>• {e}</Text>)}
        </Tappable>
        <Tappable label="Edit the notes for the client" onPress={() => setPart({ kind: 'notes' })} style={{ gap: 2 }}>
          {wd.notes ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontWeight: '700', color: P.ink }}>{lang === 'vi' ? 'Ghi chú' : 'Notes'}</Text>
                <Pen />
              </View>
              <Text style={{ fontSize: 12, color: P.ink2, lineHeight: 18 }}>{wd.notes}</Text>
            </>
          ) : <AddLine text={lang === 'vi' ? '+ Thêm ghi chú cho khách' : '+ Add notes for the client'} />}
        </Tappable>
        <View style={{ gap: 2 }}>
          <Text style={{ fontWeight: '700', color: P.ink }}>{T.schedule}</Text>
          {sched.map((s, k) => <Line key={k} l={`${stepName(s.label, lang)} (${s.pct}%)`} r={money(s.amount)} />)}
          {/* The steps are before tax, like the PDF says, so they do not look short of the total. */}
          <Text style={{ fontSize: 12, color: P.muted }}>{lang === 'vi' ? 'Thuế bán hàng được cộng vào mỗi hóa đơn.' : 'Sales tax is added to each invoice.'}</Text>
        </View>
      </View>
      </Untranslated>
      <Muted style={{ fontSize: 13 }}>Tap a part to change it, or Edit to see everything at once. Sign lets the client sign on this phone. Send texts or emails a link to sign, or shares the PDF, and marks the job as Sent.</Muted>
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
function QuoteEditor({ est, lang, profile, signed, onSave, onPrice, onSectionPrice }: {
  est: Estimate; lang: Lang; profile: Profile; signed: boolean;
  onSave: (q: QuoteEdits | null) => void; onPrice: () => void; onSectionPrice: (trade: string) => void;
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
      <Muted style={{ fontSize: 13 }}>Changes save as you type, for this client’s language. Tap a section’s price to change it.</Muted>
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
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Muted style={{ fontSize: 12 }}>Section</Muted>
                <Pressable accessibilityRole="button" accessibilityLabel={`Change the price of ${s.title}`} onPress={() => onSectionPrice(s.trade)} hitSlop={8}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ color: est.priceEdits?.[s.trade] ? C.accent : C.ink2, fontFamily: mono, fontSize: 13 }}>{money(s.price)}</Text>
                  {signed ? null : <Ionicons name="pencil" size={12} color={C.accent} />}
                </Pressable>
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
          onPress={() => confirmAction('Undo all edits?', 'The quote goes back to the wording Bidwell wrote, in every language.', 'Undo', () => onSave(null))} />
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

type Part = { kind: 'section'; trade: string } | { kind: 'scope' } | { kind: 'exclusions' } | { kind: 'notes' };

/** A part of the draft quote that opens its editor when tapped (the pencil beside its heading says so). */
function Tappable({ children, onPress, label, style }: { children: React.ReactNode; onPress: () => void; label: string; style?: object }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={({ pressed }) => [{ borderRadius: 8, marginHorizontal: -6, paddingHorizontal: 6, backgroundColor: pressed ? '#EEF2FF' : 'transparent' }, style]}>
      {children}
    </Pressable>
  );
}

const AddLine = ({ text }: { text: string }) => <Text style={{ fontSize: 13, color: P.accent, fontWeight: '600', paddingVertical: 2 }}>{text}</Text>;

/** The wording saved for one section: only what differs from Bidwell's own (so a fix to the estimate still flows in). */
function withSection(est: Estimate, lang: Lang, trade: string, title: string, itemsText: string): QuoteEdits {
  const base = baseSections(est, lang).find((b) => b.trade === trade);
  const items = lines(itemsText);
  const w = est.quoteEdits?.[lang] ?? {};
  const sections = { ...w.sections };
  const sameTitle = !base || title.trim() === base.title || !title.trim();
  const sameItems = !base || items.join('\n') === base.items.join('\n');
  if (sameTitle && sameItems) delete sections[trade];
  else sections[trade] = { title: sameTitle ? undefined : title.trim(), items: sameItems ? undefined : items };
  return { ...est.quoteEdits, [lang]: { ...w, sections } };
}

/**
 * The editor for the part of the quote that was tapped. Changes are kept only when Save is tapped. For a section,
 * the price can be set too: it becomes the job's real price (tax, total, contract and invoices follow).
 */
function PartSheet({ est, profile, lang, signed, part, onClose }: {
  est: Estimate; profile: Profile; lang: Lang; signed: boolean; part: Part | null; onClose: () => void;
}) {
  const { updateEstimate } = useApp();
  const open = !!part;
  const shown = quoteSections(est, lang);
  const wd = quoteWording(est, profile, lang);
  const sec = part?.kind === 'section' ? shown.find((x) => x.trade === part.trade) : undefined;
  const edit = part?.kind === 'section' ? est.priceEdits?.[part.trade] : undefined;
  const key = part ? (part.kind === 'section' ? part.trade : part.kind) : '';

  // The form starts from what the quote says now, each time a part is opened.
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [price, setPrice] = useState(0);
  const [opened, setOpened] = useState('');
  if (open && opened !== key) {
    setOpened(key);
    if (part.kind === 'section' && sec) { setTitle(sec.title); setText(sec.items.join('\n')); setPrice(sec.price); }
    if (part.kind === 'scope') setText(wd.scopeNote);
    if (part.kind === 'exclusions') setText(wd.exclusions.join('\n'));
    if (part.kind === 'notes') setText(wd.notes);
  }
  if (!open && opened) setOpened('');

  const close = () => { setOpened(''); onClose(); };
  const save = () => {
    if (!part) return;
    const w = est.quoteEdits?.[lang] ?? {};
    if (part.kind === 'section' && sec) {
      const q = withSection(est, lang, part.trade, title, text);
      const priceChanged = !signed && Math.abs(price - sec.price) >= 0.005;
      updateEstimate(est.id, { quoteEdits: q, ...(priceChanged ? { sectionPrices: { [part.trade]: price } } : {}) });
    } else if (part.kind === 'scope') {
      updateEstimate(est.id, { quoteEdits: { ...est.quoteEdits, [lang]: { ...w, scopeNote: text.trim() } } });
    } else if (part.kind === 'exclusions') {
      updateEstimate(est.id, { quoteEdits: { ...est.quoteEdits, [lang]: { ...w, exclusions: lines(text) } } });
    } else {
      updateEstimate(est.id, { quoteEdits: { ...est.quoteEdits, [lang]: { ...w, notes: text.trim() } } });
    }
    close();
  };
  const backToBidwell = () => {
    if (part?.kind !== 'section') return;
    const base = baseSections({ ...est, quoteEdits: undefined }, lang).find((b) => b.trade === part.trade);
    if (base) { setTitle(base.title); setText(base.items.join('\n')); }
    if (edit && !signed) setPrice(edit.base);
  };

  const heading = part?.kind === 'section' ? (sec?.title ?? 'Section') : part?.kind === 'scope' ? 'Scope summary' : part?.kind === 'exclusions' ? 'Not included' : 'Notes for the client';
  const target: QuoteWriteTarget | null = part?.kind === 'section' ? { kind: 'section', trade: part.trade } : part?.kind === 'scope' ? { kind: 'scope' } : part?.kind === 'notes' ? { kind: 'notes' } : null;
  const diff = sec ? Math.round((price - sec.price) * 100) / 100 : 0;
  return (
    <Sheet visible={open} onClose={close} title={heading} scroll>
      <View style={{ gap: 12, paddingHorizontal: 8, paddingBottom: 8 }}>
        {part?.kind === 'section' ? (
          <>
            <Field label="Heading" value={title} onChangeText={setTitle} maxLength={120} />
            <Field label="What's included (one line each)" value={text} onChangeText={setText} multiline />
            {signed ? (
              <Muted style={{ fontSize: 13 }}>The client already signed this price. To charge more or less now, use a change order on the contract.</Muted>
            ) : (
              <>
                <NumberField label="Price for this section" suffix="$" value={price} onChange={setPrice} max={9999999} />
                {diff ? (
                  <Muted style={{ fontSize: 13 }}>{`${diff > 0 ? '+' : '−'}${money(Math.abs(diff))} on this section. New total with tax: ${money(Math.round((est.price + diff) * (1 + est.salesTaxPct / 100) * 100) / 100)}`}</Muted>
                ) : edit ? (
                  <Muted style={{ fontSize: 13 }}>{`You set this price. Bidwell priced it at ${money(edit.base)}.`}</Muted>
                ) : (
                  <Muted style={{ fontSize: 13 }}>From your markup and costs. Change it here if it doesn’t feel right for this client.</Muted>
                )}
              </>
            )}
            {(est.quoteEdits?.[lang]?.sections?.[part.trade] || edit) ? (
              <Button kind="ghost" icon="refresh-outline" title="Back to Bidwell’s wording and price" onPress={backToBidwell} />
            ) : null}
          </>
        ) : (
          <Field label={part?.kind === 'exclusions' ? 'One line each' : part?.kind === 'scope' ? 'Shown under the job title' : 'Allowances, timing, access, cleanup…'}
            value={text} onChangeText={setText} multiline />
        )}
        {target && part ? <HelpWrite est={est} lang={lang} target={target} draft={text} onText={setText} /> : null}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
          <Button kind="secondary" title="Cancel" style={{ flex: 1 }} onPress={close} />
          <Button title="Save" icon="checkmark" style={{ flex: 1.4 }} onPress={save} />
        </View>
      </View>
    </Sheet>
  );
}

/** The small pencil beside a heading that can be tapped to edit. Only on this preview, never on the PDF. */
const Pen = () => <Ionicons name="pencil" size={12} color={C.accent} style={{ marginLeft: 6 }} />;
