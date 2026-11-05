import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { ftIn, manualRoom, planSvg, planTotals, roomFromScan, roomMeasures } from '@/engine/floorplan';
import { newId } from '@/engine/format';
import { jobType } from '@/engine/jobTypes';
import { suggestFromScan } from '@/engine/recommend';
import { emptyRoom } from '@/engine/site';
import type { PlanRoom } from '@/engine/types';
import { useApp } from '@/store/AppContext';
import { Art } from '@/ui/art';
import { Banner, Button, C, Card, Chip, Field, H2, Muted, NumberField, P, Screen, Stat } from '@/ui/kit';
import { HudPanel, Readout } from '@/ui/hud';
import { Pulse, Reveal } from '@/ui/motion';
import { notify } from '@/ui/notify';
import { Text } from '@/ui/text';

import { scanRoom, scanSupport } from '../../modules/room-scan/src';

const WHY: Record<Exclude<ReturnType<typeof scanSupport>, 'ok'>, { title: string; text: string }> = {
  web: { title: '3D scanning works in the iPhone app', text: 'Open Bidwell AI from TestFlight or the App Store on an iPhone Pro to scan. Here you can measure rooms by hand below.' },
  android: { title: '3D scanning needs an iPhone Pro', text: 'Android phones don’t have Apple’s room scanner. Measure rooms by hand below; the plan and areas work the same.' },
  'not-installed': { title: 'Update the app to scan', text: 'This version of the app doesn’t include the scanner. Install the latest build from TestFlight.' },
  'no-lidar': { title: 'This iPhone has no LiDAR sensor', text: '3D room scanning needs an iPhone 12 Pro or newer Pro model (or iPad Pro). Measure rooms by hand below instead.' },
};

/** Scan rooms in 3D with the iPhone's LiDAR (or measure by hand), then start an estimate or job site from the plan. */
export default function ScanScreen() {
  const { setPendingPlan, projects, updateProject } = useApp();
  const { width } = useWindowDimensions();
  const support = scanSupport();
  const [rooms, setRooms] = useState<PlanRoom[]>([]);
  const [name, setName] = useState('');
  const [scanning, setScanning] = useState(false);
  const [lengthFt, setLength] = useState(0);
  const [widthFt, setWidth] = useState(0);
  const [heightFt, setHeight] = useState(8);
  const [pickSite, setPickSite] = useState(false);
  const drawW = Math.min(width, 760) - 64;
  const nextName = name.trim() || `Room ${rooms.length + 1}`;
  const totals = planTotals(rooms);
  const active = projects.filter((p) => p.status === 'active');

  const scan = async () => {
    setScanning(true);
    try {
      const room = roomFromScan(await scanRoom(), nextName, newId());
      if (!room) notify('Scan too short', 'The scanner found fewer than 3 walls. Walk the whole room slowly, pointing at every wall, then try again.');
      else { setRooms((r) => [...r, room]); setName(''); }
    } catch (e) {
      const code = typeof e === 'object' && e && 'code' in e ? String((e as { code: unknown }).code) : '';
      if (code !== 'CANCELED') notify('Scan did not finish', e instanceof Error ? e.message : 'Try again, or measure the room by hand.');
    } finally {
      setScanning(false);
    }
  };

  const addManual = () => {
    setRooms((r) => [...r, manualRoom(newId(), nextName, lengthFt, widthFt, heightFt || 8, 1, 1)]);
    setName(''); setLength(0); setWidth(0);
  };

  const toEstimate = () => {
    setPendingPlan(rooms);
    router.replace('/new');
  };

  const toSite = (projectId: string) => {
    updateProject(projectId, (p) => ({ ...p, rooms: [...p.rooms, ...rooms.filter((r) => !p.rooms.some((x) => x.name === r.name)).map((r) => emptyRoom(newId(), r.name))] }));
    notify('Rooms added to the job site', rooms.map((r) => r.name).join(', '));
    router.replace(`/site/${projectId}`);
  };

  return (
    <Screen footer={rooms.length ? (
      <View style={{ gap: 10 }}>
        <Button title="Start an estimate with this plan" icon="calculator-outline" onPress={toEstimate} />
        {active.length ? <Button kind="secondary" title="Add these rooms to a job site" icon="construct-outline" onPress={() => setPickSite(!pickSite)} /> : null}
        {pickSite ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {active.map((p) => <Chip key={p.id} label={p.title} onPress={() => toSite(p.id)} />)}
          </View>
        ) : null}
      </View>
    ) : undefined}>
      <Reveal style={{ alignItems: 'center', gap: 6 }}>
        <Art name="scan" width={Math.min(300, drawW)} beam={support === 'ok' || scanning} />
        <Text style={{ color: C.ink, fontSize: 24, fontWeight: '800', textAlign: 'center' }}>Scan rooms in 3D</Text>
        <Muted style={{ textAlign: 'center', maxWidth: 360 }}>
          Walk the room with your iPhone. Walls, doors and windows are measured for you, the floor plan is drawn, and the areas go straight into the estimate.
        </Muted>
      </Reveal>

      {support === 'ok' ? (
        <Card>
          <Field label="Room name" value={name} onChangeText={setName} placeholder={`Room ${rooms.length + 1}`} maxLength={40} />
          <Pulse active={!scanning && rooms.length === 0}>
            <Button title={scanning ? 'Scanning…' : rooms.length ? 'Scan the next room' : 'Start 3D scan'} icon="scan-outline" disabled={scanning} onPress={scan} />
          </Pulse>
          <Muted style={{ fontSize: 13 }}>Tips: good light, walk slowly along the walls, point at every corner, door and window. Tap Done when the outline is complete.</Muted>
        </Card>
      ) : (
        <Banner tone="info" title={WHY[support].title}>{WHY[support].text}</Banner>
      )}

      {rooms.length ? (
        <Reveal>
          <HudPanel>
            <Readout color={C.accentDark}>Bidwell suggests · indoor work only</Readout>
            {suggestFromScan(rooms).map((sg) => (
              <Pressable key={sg.jobTypeId} accessibilityRole="button" onPress={() => { setPendingPlan(rooms); router.replace(`/new?type=${sg.jobTypeId}`); }}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, opacity: pressed ? 0.7 : 1 })}>
                <Ionicons name="sparkles" size={18} color={C.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.ink, fontWeight: '700', fontSize: 15 }}>{jobType(sg.jobTypeId).name}</Text>
                  <Text style={{ color: C.muted, fontSize: 13 }}>{sg.why}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={C.muted} />
              </Pressable>
            ))}
            <Text style={{ color: C.muted, fontSize: 13 }}>Name each room (Bath, Kitchen, Bedroom…) for better suggestions. Roof, siding, decks and yard work are left out.</Text>
          </HudPanel>
        </Reveal>
      ) : null}

      {rooms.length ? (
        <Reveal>
          <Card>
            <View style={{ backgroundColor: P.paper, borderRadius: 6, padding: 8, alignItems: 'center' }}>
              <SvgXml xml={planSvg(rooms, drawW - 16)} width={drawW - 16} />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Stat label="Floor" value={`${totals.floorSf} SF`} tone="accent" />
              <Stat label="Walls" value={`${totals.wallSf} SF`} />
              <Stat label="Baseboard" value={`${totals.baseboardLf} LF`} />
            </View>
            {rooms.map((r) => {
              const m = roomMeasures(r);
              return (
                <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderTopWidth: 1, borderColor: C.lineSoft }}>
                  <Ionicons name={r.source === 'scan' ? 'scan' : 'resize'} size={18} color={C.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.ink, fontWeight: '600' }}>{r.name}</Text>
                    <Text style={{ color: C.muted, fontSize: 12 }}>{ftIn(r.lengthFt)} × {ftIn(r.widthFt)} · {m.floorSf} SF</Text>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${r.name}`} hitSlop={8} onPress={() => setRooms(rooms.filter((x) => x.id !== r.id))}>
                    <Ionicons name="close-circle-outline" size={20} color={C.muted} />
                  </Pressable>
                </View>
              );
            })}
          </Card>
        </Reveal>
      ) : null}

      <Card>
        <H2>{support === 'ok' ? 'Or measure by hand' : 'Measure by hand'}</H2>
        {support !== 'ok' ? <Field label="Room name" value={name} onChangeText={setName} placeholder={`Room ${rooms.length + 1}`} maxLength={40} /> : null}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <NumberField label="Length" suffix="ft" value={lengthFt} onChange={setLength} style={{ flex: 1 }} />
          <NumberField label="Width" suffix="ft" value={widthFt} onChange={setWidth} style={{ flex: 1 }} />
          <NumberField label="Ceiling" suffix="ft" value={heightFt} onChange={setHeight} style={{ flex: 1 }} />
        </View>
        <Button kind="secondary" title="Add room" disabled={!(lengthFt > 0 && widthFt > 0 && lengthFt < 1000 && widthFt < 1000 && heightFt <= 30)} onPress={addManual} />
      </Card>
    </Screen>
  );
}
