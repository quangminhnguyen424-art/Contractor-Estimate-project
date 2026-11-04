import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { acceptedBlock, changedSinceSigned, hasInk, signatureSvg } from '@/engine/contract';
import { dateFmt, money } from '@/engine/format';
import { quoteHtml } from '@/engine/quote';
import type { Lang } from '@/engine/types';
import { useApp } from '@/store/AppContext';
import { Art } from '@/ui/art';
import { Banner, Button, C, Field, Muted, P, Screen, Segmented } from '@/ui/kit';
import { Reveal } from '@/ui/motion';
import { confirmAction, notify } from '@/ui/notify';
import { sharePdf } from '@/ui/share';
import { SignaturePad } from '@/ui/SignaturePad';
import { Text } from '@/ui/text';

const T = {
  en: { title: 'Accept this quote', body: (t: string, c: string) => `By signing, I accept the quote from ${c} for ${t} including sales tax, with its scope, exclusions, payment schedule and terms.`, name: 'Your full name', sign: 'Accept and sign' },
  vi: { title: 'Chấp nhận báo giá', body: (t: string, c: string) => `Bằng việc ký tên, tôi đồng ý báo giá của ${c} với tổng ${t} (gồm thuế), cùng phạm vi công việc, các mục không bao gồm, lịch thanh toán và điều khoản.`, name: 'Họ và tên', sign: 'Đồng ý và ký tên' },
};

/** The client reads the total and signs with a finger, on the contractor's phone. */
export default function SignScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { estimates, profile, contracts, updateContract, updateEstimate } = useApp();
  const { width } = useWindowDimensions();
  const est = estimates.find((e) => e.id === id);
  const contract = contracts.find((c) => c.estimateId === id);
  const [lang, setLang] = useState<Lang>(profile?.quoteLanguage ?? 'en');
  const [name, setName] = useState(est?.clientName ?? '');
  const [strokes, setStrokes] = useState<number[][]>([]);
  const [drawing, setDrawing] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!est || !profile) return <Screen><Muted>Estimate not found.</Muted></Screen>;
  const padW = Math.min(width, 760) - 32;
  const L = T[lang];
  const signed = contract?.accepted;

  const sign = () => {
    if (!name.trim()) return notify(lang === 'vi' ? 'Nhập họ tên' : 'Type your name', '');
    if (!hasInk(strokes)) return notify(lang === 'vi' ? 'Ký tên trong khung trắng' : 'Sign in the white box', '');
    updateContract(est.id, (c) => ({
      ...c, accepted: { name: name.trim(), strokes, w: padW, h: 170, signedAt: new Date().toISOString(), total: est.total },
    }));
    if (est.status !== 'won') updateEstimate(est.id, { status: 'won' });
    notify(lang === 'vi' ? 'Đã ký' : 'Signed', lang === 'vi' ? 'Báo giá đã được chấp nhận. Công việc chuyển sang "Đã nhận".' : 'The quote is accepted and the job is marked Won.');
    router.replace(`/estimate/${est.id}/contract`);
  };

  const share = async () => {
    if (!signed) return;
    setBusy(true);
    try {
      await sharePdf(quoteHtml(est, profile, lang, acceptedBlock(signed, profile, lang)), `Signed quote — ${est.title}`);
    } catch {
      notify('Could not create the PDF', 'Please try again.');
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
            It was {money(signed.total)} when signed and is {money(est.total)} now. Use a change order for the difference, or have the client sign again.
          </Banner>
        ) : null}
        <View style={{ backgroundColor: P.paper, borderRadius: 14, padding: 12 }}>
          <SvgXml xml={signatureSvg(signed, '#0F172A')} width={padW - 24} height={Math.round(((padW - 24) * signed.h) / signed.w)} />
        </View>
        <Segmented<Lang> value={lang} onChange={setLang} options={[{ value: 'en', label: 'English' }, { value: 'vi', label: 'Tiếng Việt' }]} />
        <Button title={busy ? 'Creating PDF…' : 'Share signed quote PDF'} icon="share-outline" disabled={busy} onPress={share} />
        <Button kind="secondary" title="Contract & payments" icon="wallet-outline" onPress={() => router.replace(`/estimate/${est.id}/contract`)} />
        <Button kind="danger" title="Remove signature (client signs again)"
          onPress={() => confirmAction('Remove the signature?', 'The client will need to sign again.', 'Remove', () => updateContract(est.id, (c) => ({ ...c, accepted: undefined })))} />
      </Screen>
    );
  }

  return (
    <Screen scrollEnabled={!drawing}>
      <Segmented<Lang> value={lang} onChange={setLang} options={[{ value: 'en', label: 'English' }, { value: 'vi', label: 'Tiếng Việt' }]} />
      <Muted style={{ fontSize: 13 }}>Hand the phone to your client. They check the total and sign with a finger.</Muted>
      <Reveal>
        <View style={{ backgroundColor: P.paper, borderRadius: 18, padding: 18, gap: 10 }}>
          <Text style={{ color: P.muted, fontSize: 13 }}>{profile.companyName}</Text>
          <Text style={{ color: P.ink, fontSize: 20, fontWeight: '800' }}>{L.title}</Text>
          <Text style={{ color: P.ink, fontSize: 15, fontWeight: '600' }}>{est.title}</Text>
          {est.address ? <Text style={{ color: P.muted, fontSize: 13 }}>{est.address}</Text> : null}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', borderTopWidth: 1, borderColor: P.line, paddingTop: 10 }}>
            <Text style={{ color: P.ink2 }}>{lang === 'vi' ? 'Tổng (gồm thuế)' : 'Total with tax'}</Text>
            <Text style={{ color: P.ink, fontSize: 26, fontWeight: '800', fontFamily: '__numbers__' }}>{money(est.total)}</Text>
          </View>
          <Text style={{ color: P.ink2, fontSize: 13, lineHeight: 19 }}>{L.body(money(est.total), profile.companyName)}</Text>
        </View>
      </Reveal>
      <Field label={L.name} value={name} onChangeText={setName} maxLength={80} autoComplete="name" />
      <SignaturePad width={padW} strokes={strokes} onChange={setStrokes} onDrawing={setDrawing} />
      <Button title={L.sign} icon="create-outline" disabled={!name.trim() || !hasInk(strokes)} onPress={sign} />
      <Muted style={{ fontSize: 12 }}>The signature is saved with this job and printed on the signed quote PDF.</Muted>
    </Screen>
  );
}
