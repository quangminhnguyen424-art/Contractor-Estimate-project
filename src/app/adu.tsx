import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Share, View } from 'react-native';

import { aduLink, deleteAduLead, fetchAduLeads, getAduPage, markAduLeadsSeen, saveAduPage, type AduLead, type AduPage } from '@/cloud/adu';
import { useCloud } from '@/cloud/CloudProvider';
import { aduCost, checkAdu, type AduResult } from '@/engine/adu';
import { aduRules, aduWords, type AduLang } from '@/engine/aduText';
import { presetFor } from '@/engine/estimator';
import { findParcels, type Parcel } from '@/engine/parcel';
import { useLanguage } from '@/i18n';
import { useApp } from '@/store/AppContext';
import { Banner, Button, C, Card, Field, H2, Muted, NumberField, Screen, Section, Segmented } from '@/ui/kit';
import { RULES_CHECKED_LABEL } from '@/engine/permits';
import { confirmAction, notify } from '@/ui/notify';
import { Text } from '@/ui/text';

const money = (n: number) => `$${n.toLocaleString('en-US')}`;
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
/** The cloud has no ADU tables until the update (supabase/migrations/20261117000000_adu_leads.sql) is run. */
const notReady = (e: unknown) => e instanceof Error && /adu_(pages|leads)|schema cache|does not exist/i.test(e.message);

const VERDICT_TONE: Record<string, { bg: string; ink: string }> = {
  yes: { bg: C.okBg, ink: C.okInk }, likely: { bg: C.infoBg, ink: C.infoInk }, check: { bg: C.warnBg, ink: C.warnInk }, no: { bg: C.badBg, ink: C.danger },
};

/**
 * ADU check page: a free public page where homeowners type their address and see what they can build on their lot
 * and about what it costs at this contractor's prices. Asking for the full report sends the contractor a lead.
 * This screen sets the page up, shares its link, checks an address on the spot and lists the leads.
 */
export default function AduScreen() {
  const { profile, presets } = useApp();
  const cloud = useCloud();
  const { language } = useLanguage();
  const lang: AduLang = language?.code.startsWith('vi') ? 'vi' : 'en';
  const uid = cloud.user?.id;

  const [page, setPage] = useState<AduPage | null>(null);
  const [form, setForm] = useState<Omit<AduPage, 'code'> | null>(null);
  const [leads, setLeads] = useState<AduLead[]>([]);
  const [loading, setLoading] = useState(!!cloud.user);
  const [saving, setSaving] = useState(false);
  const [missing, setMissing] = useState(false);

  const fresh = useCallback((): Omit<AduPage, 'code'> => ({
    active: true, company: profile?.companyName ?? '', phone: profile?.phone ?? '', email: profile?.email ?? '', logo: profile?.logo ?? null,
    lang: profile?.quoteLanguage === 'vi' ? 'vi' : 'en',
    // Their own price per SF for a new ADU, basic to high finish.
    price_low: presetFor('adu', 'basic', presets), price_high: presetFor('adu', 'high', presets), show_prices: true,
  }), [profile, presets]);

  useEffect(() => {
    if (!uid) return;
    let live = true;
    (async () => {
      try {
        const [p, l] = await Promise.all([getAduPage(uid), fetchAduLeads(uid)]);
        if (!live) return;
        setPage(p);
        setForm(p ? { ...p } : fresh());
        setLeads(l);
        const unseen = l.filter((x) => !x.seen).map((x) => x.id);
        if (unseen.length) void markAduLeadsSeen(uid, unseen);
      } catch (e) {
        if (!live) return;
        if (notReady(e)) setMissing(true);
        else notify('Could not load your ADU page', e instanceof Error ? e.message : 'Check your connection and try again.');
        setForm(fresh());
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [uid, fresh]);

  if (!profile) return null;

  if (!uid) {
    return (
      <Screen>
        <Intro />
        <Button title="Log in to make your page" icon="log-in-outline" onPress={() => router.push('/login')} />
        <CheckAddress lang={lang} perSf={{ low: presetFor('adu', 'basic', presets), high: presetFor('adu', 'high', presets) }} />
      </Screen>
    );
  }

  const save = async () => {
    if (!form) return;
    if (form.show_prices && !(Number(form.price_low) > 0 && Number(form.price_high) > 0)) {
      notify('Add your price per SF', 'Or turn prices off: homeowners then ask you for a price.');
      return;
    }
    setSaving(true);
    try {
      const saved = await saveAduPage(uid, form);
      setPage(saved); setForm({ ...saved });
      notify(page ? 'Saved' : 'Your ADU page is ready', page ? 'The page shows your changes now.' : 'Share the link on your website, Facebook, Google profile and in texts to homeowners.');
    } catch (e) {
      if (notReady(e)) setMissing(true);
      else notify('Could not save', e instanceof Error ? e.message : 'Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const link = page ? aduLink(page.code) : '';
  const share = () => Share.share({ message: shareText(form?.lang ?? lang, link) });

  const remove = (l: AduLead) => confirmAction('Delete this lead?', 'It is removed from your list for good.', 'Delete', async () => {
    try { await deleteAduLead(uid, l.id); setLeads((x) => x.filter((y) => y.id !== l.id)); } catch (e) { notify('Could not delete', e instanceof Error ? e.message : ''); }
  });

  return (
    <Screen>
      <Intro />
      {missing ? (
        <Banner tone="warn" title="The cloud needs a one-time update">
          Run the file supabase/migrations/20261117000000_adu_leads.sql in Supabase (SQL Editor → paste → Run), then open this page again.
        </Banner>
      ) : null}
      {loading ? <ActivityIndicator color={C.accent} /> : null}

      {!loading && form && !missing ? (
        <>
          {page ? (
            <Card style={{ gap: 10 }}>
              <H2>Your page</H2>
              <Text raw selectable style={{ color: C.accentDark, fontSize: 14 }}>{link}</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button title="Share link" icon="share-outline" style={{ flex: 1 }} onPress={share} />
                <Button kind="secondary" title="Open" icon="open-outline" style={{ flex: 1 }} onPress={() => Linking.openURL(link)} />
              </View>
              {!page.active ? <Muted>The page is off: homeowners see “This link isn’t available”.</Muted> : null}
            </Card>
          ) : null}

          <Card style={{ gap: 12 }}>
            <H2>{page ? 'Page settings' : 'Set up your page'}</H2>
            <Field label="Company name on the page" value={form.company} onChangeText={(company) => setForm({ ...form, company })} maxLength={120} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Field label="Phone" value={form.phone} onChangeText={(phone) => setForm({ ...form, phone })} keyboardType="phone-pad" maxLength={40} style={{ flex: 1 }} />
              <Field label="Email" value={form.email} onChangeText={(email) => setForm({ ...form, email })} keyboardType="email-address" autoCapitalize="none" maxLength={120} style={{ flex: 1 }} />
            </View>
            <Text style={{ color: C.ink2, fontWeight: '600' }}>Page language</Text>
            <Segmented value={form.lang} onChange={(v) => setForm({ ...form, lang: v })} options={[{ value: 'en', label: 'English' }, { value: 'vi', label: 'Tiếng Việt' }]} />
            <Muted style={{ fontSize: 13 }}>Homeowners can switch between English and Vietnamese on the page.</Muted>
            <Text style={{ color: C.ink2, fontWeight: '600' }}>Show your price range</Text>
            <Segmented value={form.show_prices ? 'on' : 'off'} onChange={(v) => setForm({ ...form, show_prices: v === 'on' })}
              options={[{ value: 'on', label: 'Show prices' }, { value: 'off', label: 'Hide prices' }]} />
            {form.show_prices ? (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <NumberField label="Low, per SF" value={Number(form.price_low) || 0} onChange={(n) => setForm({ ...form, price_low: n })} suffix="$/SF" max={4999} style={{ flex: 1 }} />
                <NumberField label="High, per SF" value={Number(form.price_high) || 0} onChange={(n) => setForm({ ...form, price_high: n })} suffix="$/SF" max={4999} style={{ flex: 1 }} />
              </View>
            ) : null}
            {form.show_prices ? <Muted style={{ fontSize: 13 }}>From your New ADU prices (basic to high finish). The page multiplies them by the ADU size and rounds to $5,000.</Muted> : null}
            {page ? (
              <>
                <Text style={{ color: C.ink2, fontWeight: '600' }}>Page</Text>
                <Segmented value={form.active ? 'on' : 'off'} onChange={(v) => setForm({ ...form, active: v === 'on' })} options={[{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} />
              </>
            ) : null}
            <Button title={saving ? 'Saving…' : page ? 'Save' : 'Make my page'} icon={page ? 'checkmark' : 'sparkles'} disabled={saving || !form.company.trim()} onPress={save} />
          </Card>

          <Section title={leads.length ? `Leads (${leads.length})` : 'Leads'} />
          {leads.length ? leads.map((l) => <LeadCard key={l.id} lead={l} lang={lang} onDelete={() => remove(l)} />) : (
            <Muted>No leads yet. Homeowners who ask for the full report on your page show up here, with their address and what their lot allows.</Muted>
          )}
        </>
      ) : null}

      <CheckAddress lang={lang} perSf={form?.show_prices !== false ? { low: Number(form?.price_low) || 0, high: Number(form?.price_high) || 0 } : { low: 0, high: 0 }} />
    </Screen>
  );
}

/** What goes with the link when it is shared: in the page's language, for homeowners (not the app's wording). */
function shareText(lang: AduLang, link: string) {
  return lang === 'vi'
    ? `Nhà bạn xây ADU / nhà sau vườn được không? Kiểm tra miễn phí trong 1 phút: ${link}`
    : `Can you build an ADU or backyard cottage on your lot? Check free in one minute: ${link}`;
}

function Intro() {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: C.ink, fontSize: 24, fontWeight: '800', letterSpacing: -0.3 }}>ADU check page</Text>
      <Muted>A free page for homeowners: they type their address for a first look at what the ADU rules generally allow and a rough cost at your prices. To see the full report they leave their name and phone, and you get the lead here.</Muted>
      <Banner tone="info" title="A research tool, not a decision">
        {`It reads the county's public records and the rules as last checked ${RULES_CHECKED_LABEL}. Only the city decides what can be built on a lot. Homeowners see the same notice on their page.`}
      </Banner>
    </View>
  );
}

function LeadCard({ lead: l, lang, onDelete }: { lead: AduLead; lang: AduLang; onDelete: () => void }) {
  const tel = l.phone.replace(/[^0-9+]/g, '');
  const tone = VERDICT_TONE[l.verdict] ?? VERDICT_TONE.check;
  const verdict = (aduWords(lang).verdict as Record<string, string>)[l.verdict];
  const start = () => router.push({
    pathname: '/new',
    params: { type: 'adu', lead: l.id, client: l.name, address: l.address,
      note: [`ADU lead from the ADU check page.`, l.lot_sqft ? `Lot ${l.lot_sqft.toLocaleString('en-US')} SF, zoning ${l.zoning || 'unknown'}, ${l.city}.` : '', l.message].filter(Boolean).join(' ') },
  });
  return (
    <Card style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text raw style={{ color: C.ink, fontSize: 17, fontWeight: '700' }}>{l.name}</Text>
          <Text raw style={{ color: C.muted, fontSize: 13 }}>{when(l.created_at)}{l.seen ? '' : ' · new'}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Delete lead" onPress={onDelete} hitSlop={10}>
          <Ionicons name="trash-outline" size={20} color={C.muted} />
        </Pressable>
      </View>
      {l.address ? <Text raw style={{ color: C.ink2 }}>{l.address}</Text> : null}
      <Text raw style={{ color: C.muted, fontSize: 13 }}>{[l.city, l.zoning && `zoning ${l.zoning}`, l.lot_sqft ? `${l.lot_sqft.toLocaleString('en-US')} SF lot` : '', l.pin && `parcel ${l.pin}`].filter(Boolean).join(' · ')}</Text>
      {verdict ? <View style={{ alignSelf: 'flex-start', backgroundColor: tone.bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}><Text raw style={{ color: tone.ink, fontSize: 13, fontWeight: '600' }}>{verdict}</Text></View> : null}
      {l.message ? <Text raw style={{ color: C.ink2, fontStyle: 'italic' }}>“{l.message}”</Text> : null}
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {tel ? <Button kind="secondary" title="Call" icon="call-outline" style={{ flex: 1, minWidth: 90 }} onPress={() => Linking.openURL(`tel:${tel}`)} /> : null}
        {tel ? <Button kind="secondary" title="Text" icon="chatbubble-outline" style={{ flex: 1, minWidth: 90 }} onPress={() => Linking.openURL(`sms:${tel}`)} /> : null}
        {l.email ? <Button kind="secondary" title="Email" icon="mail-outline" style={{ flex: 1, minWidth: 90 }} onPress={() => Linking.openURL(`mailto:${l.email}`)} /> : null}
      </View>
      <Button title="Start an estimate" icon="add" onPress={start} />
    </Card>
  );
}

/** The same check the homeowner's page does, for an address the contractor is looking at. */
function CheckAddress({ lang, perSf }: { lang: AduLang; perSf: { low: number; high: number } }) {
  const [addr, setAddr] = useState('');
  const [busy, setBusy] = useState(false);
  const [lot, setLot] = useState<Parcel | null>(null);
  const [res, setRes] = useState<AduResult | null>(null);
  const [err, setErr] = useState('');
  const w = aduWords(lang);

  const go = async () => {
    setBusy(true); setErr(''); setRes(null); setLot(null);
    try {
      const found = await findParcels(addr);
      if (!found.length) { setErr('Not found in King County records. Check the address.'); return; }
      setLot(found[0]);
      setRes(checkAdu({ city: found[0].city, zoning: found[0].zoning, lotSqft: found[0].lotSqft, use: found[0].use }));
    } catch {
      setErr('King County’s records did not answer. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };
  const tone = res ? VERDICT_TONE[res.verdict] : null;

  return (
    <Card style={{ gap: 10 }}>
      <H2>Check an address</H2>
      <Muted style={{ fontSize: 13 }}>King County lots: zoning, lot size and what the ADU rules generally allow.</Muted>
      <Field label="Address" value={addr} onChangeText={setAddr} placeholder="1234 Main St, Seattle" autoComplete="street-address" returnKeyType="search" onSubmitEditing={go} />
      <Button kind="secondary" title={busy ? 'Looking up…' : 'Check this lot'} icon="search" disabled={busy || addr.trim().length < 5} onPress={go} />
      {err ? <Text style={{ color: C.danger }}>{err}</Text> : null}
      {res && lot && tone ? (
        <View style={{ gap: 8 }}>
          <View style={{ backgroundColor: tone.bg, borderRadius: 14, padding: 12, gap: 4 }}>
            <Text raw style={{ color: tone.ink, fontWeight: '700', fontSize: 16 }}>{w.verdict[res.verdict]}</Text>
            {res.reasons.map((k) => <Text raw key={k} style={{ color: C.ink2, fontSize: 14, lineHeight: 20 }}>{w.reason[k]}</Text>)}
          </View>
          <Text raw style={{ color: C.muted, fontSize: 13 }}>{[lot.address, lot.address.toLowerCase().endsWith(lot.city.toLowerCase()) ? '' : lot.city, lot.zoning && `zoning ${lot.zoning}`, lot.lotSqft ? `${lot.lotSqft.toLocaleString('en-US')} SF lot` : '', `parcel ${lot.pin}`].filter(Boolean).join(' · ')}</Text>
          {aduRules(res, lang).map((r) => <Text raw key={r} style={{ color: C.ink2, fontSize: 14, lineHeight: 20 }}>• {r}</Text>)}
          {perSf.low || perSf.high ? <Muted style={{ fontSize: 13 }}>Rough estimate at your prices, not a quote:</Muted> : null}
          {res.sizes.map((s) => {
            const c = aduCost(s.sf, perSf);
            return <Text raw key={s.sf} style={{ color: C.ink, fontSize: 14 }}>{s.sf.toLocaleString('en-US')} SF · {w.beds(s.beds)}{c ? ` · ${money(c.low)}–${money(c.high)}` : ''}</Text>;
          })}
          {res.checks.map((k) => <Text raw key={k} style={{ color: C.warnInk, fontSize: 13, lineHeight: 18 }}>⚠ {w.check[k]}</Text>)}
          <Muted style={{ fontSize: 13 }}>A first look to help you research, not a decision. Only the city can say what can be built on this lot.</Muted>
        </View>
      ) : null}
    </Card>
  );
}
