import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, View } from 'react-native';

import { useCloud } from '@/cloud/CloudProvider';
import { measureAddress } from '@/cloud/roof';
import { exampleRoof, roofAnswers, roofSummary, SHAPE_LABEL, type RoofMeasure } from '@/engine/roof';
import type { Answers } from '@/engine/types';

import { Banner, Button, C, Field, List } from './kit';
import { Text } from './text';

/**
 * Measure from satellite: the job address goes to Google's roof data, and back come the roof's area, pitch of every
 * plane, shape, height and edge lengths. "Use these numbers" fills the roofing questions; the contractor checks them.
 */
export function RoofSatellite({ address: start, onUse }: { address: string; onUse: (answers: Answers, summary: string, address: string) => void }) {
  const cloud = useCloud();
  const [address, setAddress] = useState(start);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [roof, setRoof] = useState<RoofMeasure | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [example, setExample] = useState(false);
  const [used, setUsed] = useState(false);

  const measure = async () => {
    if (!cloud.user) { router.push('/login'); return; }
    if (address.trim().length < 6) { setErr('Enter the full job address.'); return; }
    setBusy(true); setErr(null); setUsed(false);
    try {
      const r = await measureAddress(address);
      setRoof(r.roof); setImage(r.image ?? null); setExample(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not measure this roof.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.line, padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.accentTint, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="planet" size={22} color={C.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.ink, fontSize: 17, fontWeight: '700' }}>Measure from satellite</Text>
          <Text style={{ color: C.muted, fontSize: 13 }}>Area, pitch, shape, height and edges from the address</Text>
        </View>
      </View>
      <Field label="Job address" value={address} onChangeText={setAddress} placeholder="Street, city, ZIP" autoComplete="street-address" textContentType="fullStreetAddress" />
      {err ? <Banner tone="warn" title={err} /> : null}
      <Button title={busy ? 'Measuring the roof…' : cloud.user ? 'Measure roof' : 'Log in to measure'} icon="scan-outline" disabled={busy} onPress={measure} />
      {!roof ? (
        <Button kind="ghost" title="See an example" onPress={() => { setRoof(exampleRoof()); setImage(null); setExample(true); setErr(null); }} />
      ) : null}

      {roof ? <RoofReport roof={roof} image={image} example={example} /> : null}
      {roof && !example ? (
        <Button title={used ? 'Numbers added ✓' : 'Use these numbers'} icon="checkmark" disabled={used}
          onPress={() => { onUse(roofAnswers(roof), roofSummary(roof), roof.address); setUsed(true); }} />
      ) : null}
    </View>
  );
}

/** The measurement, like a roof report: photo, the big numbers, edges, every plane. */
export function RoofReport({ roof, image, example }: { roof: RoofMeasure; image?: string | null; example?: boolean }) {
  const shape = SHAPE_LABEL[roof.shape];
  const big: [string, string][] = [
    ['Roof area', `${roof.areaSf.toLocaleString('en-US')} SF`],
    ['Squares', `${roof.squares}`],
    ['Main pitch', roof.pitchMin !== roof.pitchMax ? `${roof.pitch12}/12 (${roof.pitchMin}–${roof.pitchMax})` : `${roof.pitch12}/12`],
    ['Planes', `${roof.facets.length}`],
    ['Waste', `${roof.wastePct}%`],
    ['Order', `${(Math.round(roof.orderSquares * 10) / 10).toFixed(1)} sq`],
  ];
  const edges: [string, number][] = [['Eaves', roof.eavesLf], ['Rakes', roof.rakesLf], ['Ridges', roof.ridgeLf], ['Hips', roof.hipLf], ['Valleys', roof.valleyLf]];
  return (
    <View style={{ gap: 12 }}>
      {example ? <Banner tone="info" title="Example roof: enter a real address and tap Measure roof." /> : null}
      {image ? <Image source={{ uri: image }} style={{ width: '100%', aspectRatio: 1.6, borderRadius: 16, backgroundColor: C.cardHi }} accessibilityLabel="Satellite photo of the roof" /> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <View style={{ backgroundColor: C.accentTint, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 }}>
          <Text style={{ color: C.accent, fontWeight: '700' }}>{shape.en}</Text>
        </View>
        {roof.stories ? (
          <View style={{ backgroundColor: C.cardHi, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 }}>
            <Text style={{ color: C.ink2, fontWeight: '600' }}>{roof.stories === 3 ? '3+ stories' : `${roof.stories} stor${roof.stories > 1 ? 'ies' : 'y'}`} · ~{roof.heightFt} ft</Text>
          </View>
        ) : null}
      </View>
      <Text style={{ color: C.ink2, fontSize: 13 }}>{shape.note}</Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', borderRadius: 16, borderWidth: 1, borderColor: C.line, overflow: 'hidden' }}>
        {big.map(([k, v], i) => (
          <View key={k} style={{ width: '33.33%', padding: 10, gap: 2, borderColor: C.lineSoft, borderLeftWidth: i % 3 ? 1 : 0, borderTopWidth: i >= 3 ? 1 : 0 }}>
            <Text style={{ color: C.muted, fontSize: 12 }}>{k}</Text>
            <Text style={{ color: C.ink, fontSize: 17, fontWeight: '700' }} numberOfLines={1} adjustsFontSizeToFit>{v}</Text>
          </View>
        ))}
      </View>

      <Text style={{ color: C.ink, fontWeight: '700' }}>Edges (estimated)</Text>
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        {edges.map(([k, v]) => (
          <View key={k} style={{ backgroundColor: C.cardHi, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 }}>
            <Text style={{ color: C.ink2, fontSize: 13 }}>{k} <Text style={{ fontWeight: '700', color: C.ink }}>{v} LF</Text></Text>
          </View>
        ))}
      </View>

      <Text style={{ color: C.ink, fontWeight: '700' }}>Roof planes</Text>
      <List>
        {roof.facets.slice(0, 10).map((f, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 10 }}>
            <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: C.accentTint, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: `${f.azimuth}deg` }] }}>
              <Ionicons name="arrow-up" size={16} color={C.accent} />
            </View>
            <Text style={{ flex: 1, color: C.ink }}>Faces {f.facing}</Text>
            <Text style={{ color: C.ink2, width: 56 }}>{f.pitch12}/12</Text>
            <Text style={{ color: C.ink, fontWeight: '600', width: 70, textAlign: 'right' }}>{f.areaSf.toLocaleString('en-US')} SF</Text>
          </View>
        ))}
      </List>

      <Banner tone="warn" title="Check on site before ordering">
        {`Area and pitch are measured from satellite and 3D data${roof.imageryDate ? ` from ${roof.imageryDate}` : ''}${roof.quality ? ` (${roof.quality.toLowerCase()} quality)` : ''}. Edge lengths, height and waste are estimates. Trees, additions or a new roof since then can change the numbers.`}
      </Banner>
    </View>
  );
}
