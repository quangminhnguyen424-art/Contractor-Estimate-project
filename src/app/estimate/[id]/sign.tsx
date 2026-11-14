import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { packSigned } from '@/engine/brand';
import { acceptedBlock, changedSinceSigned, hasInk, signatureSvg, termsFrom } from '@/engine/contract';
import { dateFmt, money } from '@/engine/format';
import { quoteHtml } from '@/engine/quote';
import { useApp } from '@/store/AppContext';
import { ClientLanguage, signedQuoteHtml, translateFailed, useClientDocs, useClientWords } from '@/ui/ClientLanguage';
import { Art } from '@/ui/art';
import { Banner, Button, C, Field, Muted, P, Screen } from '@/ui/kit';
import { Reveal } from '@/ui/motion';
import { confirmAction, notify } from '@/ui/notify';
import { sharePdf } from '@/ui/share';
import { SignaturePad } from '@/ui/SignaturePad';
import { celebrate } from '@/ui/celebrate';
import { Text, Untranslated } from '@/ui/text';

// Everything on this screen the client reads, in the two languages documents are written in. Any other language
// is translated from the English (see useClientWords).
const EN = {
  title: 'Accept this quote', total: 'Total with tax',
  body: 'By signing, I accept the quote from {0} for {1} including sales tax, with its scope, exclusions, payment schedule and terms.',
  name: 'Your full name', sign: 'Accept and sign', needName: 'Type your name', needInk: 'Sign in the white box',
};
const VI: typeof EN = {
  title: 'Chấp nhận báo giá', total: 'Tổng (gồm thuế)',
  body: 'Bằng việc ký tên, tôi đồng ý báo giá của {0} với tổng {1} (gồm thuế), cùng phạm vi công việc, các mục không bao gồm, lịch thanh toán và điều khoản.',
  name: 'Họ và tên', sign: 'Đồng ý và ký tên', needName: 'Nhập họ tên', needInk: 'Ký tên trong khung trắng',
};
const WORDS = Object.values(EN);
const fill = (s: string, ...v: string[]) => s.replace(/\{(\d+)\}/g, (_, n: string) => v[Number(n)] ?? '');

/** The client reads the total and signs with a finger, on the contractor's phone. */
export default function SignScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { estimates, profile, contracts, updateContract, updateEstimate, emit } = useApp();
  const { width } = useWindowDimensions();
  const est = estimates.find((e) => e.id === id);
  const contract = contracts.find((c) => c.estimateId === id);
  const docs = useClientDocs(est);
  const lang = docs.lang;
  const word = useClientWords(docs.language, WORDS);
  const [name, setName] = useState(est?.clientName ?? '');
  const [strokes, setStrokes] = useState<number[][]>([]);
  const [drawing, setDrawing] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!est || !profile) return <Screen><Muted>Estimate not found.</Muted></Screen>;
  const padW = Math.min(width, 760) - 32;
  const L: typeof EN = lang === 'vi' ? VI : docs.target ? (Object.fromEntries(Object.entries(EN).map(([k, v]) => [k, word(v)])) as typeof EN) : EN;
  const signed = contract?.accepted;

  const sign = async () => {
    if (busy) return;
    if (!name.trim()) return notify(L.needName, '');
    if (!hasInk(strokes)) return notify(L.needInk, '');
    const sig = { name: name.trim(), strokes, w: padW, h: 170, signedAt: new Date().toISOString(), total: est.total };
    // Keep the exact quote they signed (both languages) and freeze its terms: later edits to the estimate
    // or to the payment schedule in Settings never change what was agreed.
    const html: { en: string; vi: string; client?: string } = { en: quoteHtml(est, profile, 'en', acceptedBlock(sig, profile, 'en')), vi: quoteHtml(est, profile, 'vi', acceptedBlock(sig, profile, 'vi')) };
    if (docs.target) {
      // Also keep the copy in the client's language. If it cannot be made now, it is made when the quote is shared.
      setBusy(true);
      try { html.client = await docs.doc(html.en); } catch { /* the English copy is the record */ } finally { setBusy(false); }
    }
    const kept = Object.fromEntries(Object.entries(html).map(([k, v]) => [k, packSigned(v, profile)]));
    // Once an invoice has gone out, the amounts it was cut from stay: a new price after that is a change order.
    updateContract(est.id, (c) => ({ ...c, accepted: { ...sig, html: kept }, terms: c.invoices.length && c.terms ? c.terms : termsFrom(est, profile) }));
    if (est.status !== 'won') updateEstimate(est.id, { status: 'won' });
    emit('quote.signed', { estimate: { id: est.id, title: est.title, client: est.clientName, total: est.total }, signedBy: sig.name, signedAt: sig.signedAt });
    celebrate();
    notify(lang === 'vi' ? 'Đã ký' : 'Signed', lang === 'vi' ? 'Báo giá đã được chấp nhận. Job chuyển sang "Đã chốt".' : 'The quote is accepted and the job is marked Won.');
    // Back to the job, which now shows Signed and the next step.
    router.dismissTo(`/job/${est.id}`);
  };

  const share = async () => {
    if (!signed) return;
    setBusy(true);
    try {
      await sharePdf(await signedQuoteHtml(est, profile, signed, docs, contract?.terms?.schedule), `Signed quote — ${est.title}`);
    } catch (e) {
      if (!translateFailed(e, docs.target)) notify('Could not create the PDF', 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (signed) {
    return (
      <Screen>
        <Reveal style={{ alignItems: 'center' }}><Art name="sign" width={220} /></Reveal>
        <Text style={{ color: C.ink, fontSize: 22, fontWeight: '800', textAlign: 'center' }}>Signed by {signed.name}</Text>
        <Muted style={{ textAlign: 'center' }}>{dateFmt(signed.signedAt)} · {money(signed.total)} with tax</Muted>
        {changedSinceSigned(est, contract) ? (
          <Banner tone="warn" title="The quote changed after it was signed">
            It was {money(signed.total)} when signed and is {money(est.total)} now. The signed quote and the contract keep the signed amount. Use a change order for the difference, or remove the signature and have the client sign again.
          </Banner>
        ) : null}
        <View style={{ backgroundColor: P.paper, borderRadius: 14, padding: 12 }}>
          <SvgXml xml={signatureSvg(signed, '#0F172A')} width={padW - 24} height={Math.round(((padW - 24) * signed.h) / signed.w)} />
        </View>
        <ClientLanguage est={est} />
        <Button title={busy ? 'Creating PDF…' : 'Share signed quote PDF'} icon="share-outline" disabled={busy} onPress={share} />
        <Button kind="secondary" title="Contract and payments" icon="wallet-outline" onPress={() => router.push(`/estimate/${est.id}/contract`)} />
        <Button kind="danger" title="Remove signature (client signs again)"
          onPress={() => confirmAction('Remove the signature?', 'The client will need to sign again.', 'Remove',
            () => updateContract(est.id, (c) => ({ ...c, accepted: undefined, terms: c.invoices.length ? c.terms : undefined })))} />
      </Screen>
    );
  }

  return (
    // The client reads the top of this screen and signs; the button they need is always in view at the bottom.
    <Screen scrollEnabled={!drawing} footer={(
      <Untranslated>
        <Button title={L.sign} icon="create-outline" disabled={busy || !name.trim() || !hasInk(strokes)} onPress={sign} />
      </Untranslated>
    )}>
      {/* This part is for the client: in their language, not the app's. */}
      <Untranslated>
      <Reveal>
        <View style={{ backgroundColor: P.paper, borderRadius: 14, padding: 18, gap: 10 }}>
          <Text style={{ color: P.muted, fontSize: 13 }}>{profile.companyName}</Text>
          <Text style={{ color: P.ink, fontSize: 20, fontWeight: '800' }}>{L.title}</Text>
          <Text style={{ color: P.ink, fontSize: 15, fontWeight: '600' }}>{est.title}</Text>
          {est.address ? <Text style={{ color: P.muted, fontSize: 13 }}>{est.address}</Text> : null}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', borderTopWidth: 1, borderColor: P.line, paddingTop: 10 }}>
            <Text style={{ color: P.ink2 }}>{L.total}</Text>
            <Text style={{ color: P.ink, fontSize: 26, fontWeight: '800', fontFamily: '__numbers__' }}>{money(est.total)}</Text>
          </View>
          <Text style={{ color: P.ink2, fontSize: 13, lineHeight: 19 }}>{fill(L.body, profile.companyName, money(est.total))}</Text>
        </View>
      </Reveal>
      <Field label={L.name} value={name} onChangeText={setName} maxLength={80} autoComplete="name" />
      <SignaturePad width={padW} strokes={strokes} onChange={setStrokes} onDrawing={setDrawing} />
      </Untranslated>
      <Muted style={{ fontSize: 13 }}>Hand the phone to your client. They check the total and sign with a finger. The signature is saved with this job and printed on the signed quote PDF.</Muted>
      <ClientLanguage est={est} />
    </Screen>
  );
}
