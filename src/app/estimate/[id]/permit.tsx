import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, Share, View } from 'react-native';

import { useCloud } from '@/cloud/CloudProvider';
import { learnFromQuotes } from '@/engine/learned';
import { findParcels } from '@/engine/parcel';
import { applicationFields, cityFromAddress, PERMIT_TITLE, permitDescriptionPrompt, permitPlan, RULE_SOURCES, RULES_CHECKED_LABEL, rulesMayBeOld, type Need } from '@/engine/permits';
import { useApp } from '@/store/AppContext';
import { aiFor, inClaudeApp } from '@/ui/host';
import { Banner, Button, C, Card, Field, H2, Muted, Screen, Section } from '@/ui/kit';
import { notify } from '@/ui/notify';
import { Text } from '@/ui/text';

const NEED: Record<Need, { text: string; bg: string; ink: string }> = {
  required: { text: 'Usually needed', bg: C.badBg, ink: C.danger },
  likely: { text: 'Often needed', bg: C.warnBg, ink: C.warnInk },
  check: { text: 'Ask the office', bg: C.infoBg, ink: C.infoInk },
};

/**
 * Permit guide for a job. It helps the contractor look things up and never decides: which permits work like this
 * usually needs, who issues them where the job is (from the county's parcel
 * record), what to prepare, the steps, a checklist, and the application's fields filled in, with the description of
 * work written by Studwise in the contractor's own style.
 */
export default function PermitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { estimates, profile, updateEstimate, apiKey, aiAllowed } = useApp();
  const cloud = useCloud();
  const est = estimates.find((e) => e.id === id);
  const [looking, setLooking] = useState(false);
  const [lookErr, setLookErr] = useState('');
  const [writing, setWriting] = useState(false);
  const [desc, setDesc] = useState(est?.permit?.description ?? '');
  const tried = useRef(false);
  const aiOn = aiAllowed && (!!apiKey || inClaudeApp || !!cloud.user);

  const lookUp = async () => {
    if (!est?.address.trim()) return;
    setLooking(true); setLookErr('');
    try {
      const found = await findParcels(est.address);
      if (!found.length) { setLookErr('This address is not in King County’s records. The city is read from the address instead.'); return; }
      const p = found[0];
      updateEstimate(est.id, { permit: { parcel: { pin: p.pin, city: p.city, zoning: p.zoning, lotSqft: p.lotSqft } } });
    } catch {
      setLookErr('King County’s records did not answer. Try again in a moment.');
    } finally {
      setLooking(false);
    }
  };

  // Look up the lot once, the first time the screen opens for a job with an address.
  useEffect(() => {
    if (tried.current || !est || est.permit?.parcel || !est.address.trim()) return;
    tried.current = true;
    void lookUp();
  });

  if (!est || !profile) return <Screen><Muted>Estimate not found.</Muted></Screen>;

  const parcel = est.permit?.parcel;
  const city = parcel?.city ?? cityFromAddress(est.address);
  const plan = permitPlan({ jobTypeId: est.jobTypeId, answers: est.answers, city });
  const done = new Set(est.permit?.done ?? []);
  const toggle = (k: string) => {
    const next = new Set(done);
    if (next.has(k)) next.delete(k); else next.add(k);
    updateEstimate(est.id, { permit: { done: [...next] } });
  };
  const fields = applicationFields(est, profile, { ...est.permit, description: desc }, plan.jurisdiction.name);

  const write = async () => {
    setWriting(true);
    try {
      // What Studwise learned from the descriptions this contractor kept on other jobs.
      const learned = learnFromQuotes(estimates.filter((e) => e.id !== est.id), 'en');
      const text = (await aiFor(apiKey, aiAllowed).complete(permitDescriptionPrompt(est, plan.items, learned.permitWording.map((d) => `- ${d}`).join('\n')), undefined, 600))
        .replace(/^["“]|["”]$/g, '').trim().slice(0, 2000);
      setDesc(text);
      updateEstimate(est.id, { permit: { description: text } });
    } catch (e) {
      notify('Studwise could not write it', e instanceof Error ? e.message : 'Try again in a moment.');
    } finally {
      setWriting(false);
    }
  };
  const saveDesc = () => { if (desc.trim() !== (est.permit?.description ?? '')) updateEstimate(est.id, { permit: { description: desc.trim() } }); };
  const copyAll = () => Share.share({ message: fields.filter((f) => f.value).map((f) => `${f.label}: ${f.value}`).join('\n') });

  return (
    <Screen>
      <View style={{ gap: 4 }}>
        <Text style={{ color: C.ink, fontSize: 24, fontWeight: '800', letterSpacing: -0.3 }}>Permit guide</Text>
        <Text raw style={{ color: C.ink2 }}>{est.title}</Text>
      </View>

      <Banner tone="info" title="A guide to help you look things up, not a decision">
        Studwise helps you find which permits work like this usually needs, who issues them and how to apply. It does not decide what this job needs: only the permit office can. Confirm with them before you bid or start work.
      </Banner>
      {rulesMayBeOld() ? (
        <Banner tone="warn" title="These rules may be out of date">
          {`They were last checked ${RULES_CHECKED_LABEL}. Check the official sources at the bottom of this page.`}
        </Banner>
      ) : null}

      <Card style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: C.accentTint, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="business" size={20} color={C.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text raw style={{ color: C.ink, fontSize: 17, fontWeight: '700' }}>{plan.jurisdiction.name}</Text>
            <Text raw style={{ color: C.muted, fontSize: 13 }}>{est.address || 'No address on this job'}</Text>
          </View>
        </View>
        {parcel ? (
          <Text raw style={{ color: C.ink2, fontSize: 14 }}>{[`Parcel ${parcel.pin}`, parcel.zoning && `zoning ${parcel.zoning}`, parcel.lotSqft ? `${parcel.lotSqft.toLocaleString('en-US')} SF lot` : ''].filter(Boolean).join(' · ')}</Text>
        ) : null}
        {lookErr ? <Muted style={{ fontSize: 13 }}>{lookErr}</Muted> : null}
        {!est.address.trim() ? <Muted style={{ fontSize: 13 }}>Add the address to the job (Edit details) to find the city and parcel.</Muted> : null}
        {est.address.trim() && !parcel ? <Button kind="secondary" title={looking ? 'Looking up…' : 'Look up the parcel'} icon="search" disabled={looking} onPress={lookUp} /> : null}
        {!city ? <Muted style={{ fontSize: 13 }}>City not recognized: the offices below are general. Check which city or county the job is in.</Muted> : null}
      </Card>

      {plan.none ? (
        <Banner tone="ok" title="This work usually needs no permit">
          Painting, flooring, cabinets, counters and similar finish work normally do not. If the job grows into walls, wiring or plumbing, check again.
        </Banner>
      ) : (
        <>
          <Section title="Permits work like this usually needs" />
          {plan.items.map((it) => (
            <Card key={it.kind} style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <H2 style={{ flex: 1 }}>{PERMIT_TITLE[it.kind]}</H2>
                <View style={{ backgroundColor: NEED[it.need].bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ color: NEED[it.need].ink, fontSize: 13, fontWeight: '700' }}>{NEED[it.need].text}</Text>
                </View>
              </View>
              <Text style={{ color: C.ink2 }}>{it.why}</Text>
              <Pressable accessibilityRole="link" onPress={() => Linking.openURL(it.office.url)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="open-outline" size={16} color={C.accent} />
                <Text raw style={{ color: C.accentDark, fontWeight: '600', flex: 1 }}>{it.office.name}</Text>
              </Pressable>
              <Text style={{ color: C.ink, fontWeight: '600', marginTop: 4 }}>What to prepare</Text>
              {it.docs.map((d) => <Text key={d} style={{ color: C.ink2, fontSize: 14, lineHeight: 20 }}>• {d}</Text>)}
              <Muted style={{ fontSize: 13 }}>{`Who can apply: ${it.who}`}</Muted>
            </Card>
          ))}

          <Section title="Application" />
          <Card style={{ gap: 10 }}>
            <Muted style={{ fontSize: 13 }}>What every permit portal asks for, filled in from this job and your company info. Copy it into the application.</Muted>
            {fields.filter((f) => f.label !== 'Description of work').map((f) => (
              <View key={f.label} style={{ flexDirection: 'row', gap: 10, borderBottomWidth: 1, borderColor: C.lineSoft, paddingBottom: 8 }}>
                <Text style={{ color: C.muted, fontSize: 13, width: 130 }}>{f.label}</Text>
                <Text raw selectable style={{ color: f.value ? C.ink : C.muted, fontSize: 14, flex: 1 }}>{f.value || '—'}</Text>
              </View>
            ))}
            <Field label="Description of work" value={desc} onChangeText={setDesc} onBlur={saveDesc} multiline maxLength={2000}
              placeholder="What is built or changed, where, sizes, structural or not, trades under separate permits" />
            <Button kind="secondary" title={writing ? 'Studwise is writing…' : desc.trim() ? 'Rewrite with Studwise' : 'Write it with Studwise'} icon="sparkles"
              disabled={writing || !aiOn} onPress={write} />
            {!aiOn ? <Muted style={{ fontSize: 13 }}>Turn on Studwise AI (log in) to have it written for you.</Muted> : null}
            {!profile.license.trim() ? <Muted style={{ fontSize: 13 }}>Add your contractor registration number in Me → Company info.</Muted> : null}
            <Button title="Copy all to paste" icon="copy-outline" onPress={copyAll} />
          </Card>

          <Section title="Steps" />
          <Card style={{ gap: 10 }}>
            {plan.steps.map((s, i) => (
              <View key={s} style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' }}>
                  <Text raw style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{i + 1}</Text>
                </View>
                <Text style={{ color: C.ink2, flex: 1, lineHeight: 20 }}>{s}</Text>
              </View>
            ))}
          </Card>

          <Section title={`Checklist (${plan.checklist.filter((c) => done.has(c.id)).length}/${plan.checklist.length})`} />
          <Card style={{ gap: 2, paddingVertical: 6 }}>
            {plan.checklist.map((c) => {
              const on = done.has(c.id);
              return (
                <Pressable key={c.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => toggle(c.id)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
                  <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={on ? C.okInk : C.muted} />
                  <Text style={{ color: on ? C.muted : C.ink, flex: 1, textDecorationLine: on ? 'line-through' : 'none' }}>{c.text}</Text>
                </Pressable>
              );
            })}
          </Card>
        </>
      )}

      <Section title="Where this comes from" />
      <Card style={{ gap: 8 }}>
        <Muted style={{ fontSize: 13, lineHeight: 18 }}>{`City, county and state rules, last checked ${RULES_CHECKED_LABEL}, and the county's parcel records. Rules change: the permit office has the final say.`}</Muted>
        {RULE_SOURCES.map((s) => (
          <Pressable key={s.url} accessibilityRole="link" onPress={() => Linking.openURL(s.url)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
            <Ionicons name="open-outline" size={16} color={C.accent} />
            <Text style={{ color: C.accent, fontSize: 14, flex: 1 }}>{s.name}</Text>
          </Pressable>
        ))}
      </Card>
    </Screen>
  );
}
