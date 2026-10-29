import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { answersFromPlan, ftIn, manualRoom, planSvg, planTotals, roomFromScan, roomMeasures } from '@/engine/floorplan';
import { newId } from '@/engine/format';
import { jobType } from '@/engine/jobTypes';
import { useApp } from '@/store/AppContext';
import { Banner, Button, C, Card, Field, H2, Muted, NumberField, Screen } from '@/ui/kit';
import { notify } from '@/ui/notify';

import { isRoomScanAvailable, scanRoom } from '../../modules/room-scan/src';

/** Floor plan for the estimate being written: scan rooms with LiDAR or measure them, see the plan, use the numbers. */
export default function FloorPlanScreen() {
  const { draft, setDraft } = useApp();
  const { width } = useWindowDimensions();
  const [name, setName] = useState('');
  const [lengthFt, setLength] = useState(0);
  const [widthFt, setWidth] = useState(0);
  const [heightFt, setHeight] = useState(8);
  const [doors, setDoors] = useState(1);
  const [windows, setWindows] = useState(1);
  const [scanning, setScanning] = useState(false);
  const canScan = isRoomScanAvailable();

  if (!draft) return <Redirect href="/new" />;
  const rooms = draft.plan ?? [];
  const totals = planTotals(rooms);
  const nextName = name.trim() || `Room ${rooms.length + 1}`;
  const setRooms = (plan: typeof rooms) => setDraft({ ...draft, plan });
  const drawWidth = Math.min(width, 760) - 64;

  const scan = async () => {
    setScanning(true);
    try {
      const result = await scanRoom();
      const room = roomFromScan(result, nextName, newId());
      if (!room) {
        notify('Scan too short', 'The scanner found fewer than 3 walls. Walk the whole room slowly, pointing at every wall, then try again.');
      } else {
        setRooms([...rooms, room]);
        setName('');
      }
    } catch (e) {
      const code = typeof e === 'object' && e && 'code' in e ? String((e as { code: unknown }).code) : '';
      if (code !== 'CANCELED') notify('Scan did not finish', e instanceof Error ? e.message : 'Try again, or measure the room by hand below.');
    } finally {
      setScanning(false);
    }
  };

  const addManual = () => {
    setRooms([...rooms, manualRoom(newId(), nextName, lengthFt, widthFt, heightFt || 8, doors, windows)]);
    setName(''); setLength(0); setWidth(0);
  };

  const use = () => {
    const jt = jobType(draft.jobTypeId);
    const { answers, heard } = answersFromPlan(jt, rooms);
    if (Object.keys(answers).length === 0) {
      notify('Plan saved with the estimate', `${jt.name} isn't priced from floor area, so no answers were changed. The plan still goes on the quote.`);
    } else {
      // These answers now come from the floor plan, not from Claude: drop their "check it" tags.
      const aiFilled = Object.fromEntries(Object.entries(draft.aiFilled ?? {}).filter(([k]) => !(k in answers)));
      setDraft({ ...draft, answers: { ...draft.answers, ...answers }, aiFilled, heard: [...heard, ...draft.heard.filter((h) => !h.endsWith('(floor plan)'))] });
    }
    router.back();
  };

  return (
    <Screen footer={rooms.length ? <Button title="Use these measurements" onPress={use} /> : undefined}>
      {rooms.length > 0 ? (
        <>
          <Card>
            <View style={{ alignItems: 'center' }}>
              <SvgXml xml={planSvg(rooms, drawWidth)} width={drawWidth} />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
              <Stat label="Floor" value={`${totals.floorSf} SF`} />
              <Stat label="Walls (net)" value={`${totals.wallSf} SF`} />
              <Stat label="Baseboard" value={`${totals.baseboardLf} LF`} />
              <Stat label="Doors / windows" value={`${totals.doors} / ${totals.windows}`} />
            </View>
          </Card>
          {rooms.map((r) => {
            const m = roomMeasures(r);
            return (
              <Card key={r.id} style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ flex: 1, fontWeight: '700', color: C.ink }}>{r.name}</Text>
                  <Muted style={{ fontSize: 12 }}>{r.source === 'scan' ? 'LiDAR scan' : 'Measured'}</Muted>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${r.name}`} onPress={() => setRooms(rooms.filter((x) => x.id !== r.id))} style={{ padding: 6 }}>
                    <Text style={{ color: '#B42318', fontWeight: '600' }}>Remove</Text>
                  </Pressable>
                </View>
                <Muted style={{ fontSize: 13 }}>
                  {ftIn(r.lengthFt)} × {ftIn(r.widthFt)} · {m.floorSf} SF floor · {m.wallSf} SF walls · {ftIn(r.heightFt)} ceiling
                </Muted>
                {r.lowConfidence ? (
                  <Text style={{ color: C.warnInk, fontSize: 13 }}>
                    The scanner was unsure about {r.lowConfidence} surface{r.lowConfidence > 1 ? 's' : ''}. Check those measurements with a tape.
                  </Text>
                ) : null}
              </Card>
            );
          })}
        </>
      ) : (
        <Muted>Add each room. The app draws the floor plan and works out floor area, wall area and baseboard for the estimate.</Muted>
      )}

      <Card>
        <H2>Add a room</H2>
        <Field label="Room name" value={name} onChangeText={setName} placeholder={`Room ${rooms.length + 1}`} maxLength={40} />
        {canScan ? (
          <>
            <Button title={scanning ? 'Scanning…' : 'Scan room with LiDAR'} disabled={scanning} onPress={scan} />
            <Muted style={{ fontSize: 13 }}>Walk slowly around the room and point at every wall, door and window. Tap Done, check the model, then Use this scan.</Muted>
          </>
        ) : (
          <Banner tone="info" title="LiDAR scanning needs the installed iPhone app">
            It works on iPhone Pro and iPad Pro models in the App Store / TestFlight version. Here, measure the room below.
          </Banner>
        )}
      </Card>

      <Card>
        <H2>{canScan ? 'Or measure by hand' : 'Measure by hand'}</H2>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <NumberField label="Length" suffix="ft" value={lengthFt} onChange={setLength} style={{ flex: 1 }} />
          <NumberField label="Width" suffix="ft" value={widthFt} onChange={setWidth} style={{ flex: 1 }} />
          <NumberField label="Ceiling" suffix="ft" value={heightFt} onChange={setHeight} style={{ flex: 1 }} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <NumberField label="Doors" value={doors} onChange={setDoors} decimals={false} style={{ flex: 1 }} />
          <NumberField label="Windows" value={windows} onChange={setWindows} decimals={false} style={{ flex: 1 }} />
        </View>
        <Button kind="secondary" title="Add room" onPress={addManual}
          disabled={!(lengthFt > 0 && widthFt > 0 && lengthFt < 1000 && widthFt < 1000 && heightFt <= 30 && doors <= 50 && windows <= 50)} />
        {heightFt > 30 || doors > 50 || windows > 50 ? <Muted style={{ fontSize: 13 }}>Check the numbers: ceiling up to 30 ft, up to 50 doors and 50 windows per room.</Muted> : null}
      </Card>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Muted style={{ fontSize: 12 }}>{label}</Muted>
      <Text style={{ color: C.ink, fontWeight: '700' }}>{value}</Text>
    </View>
  );
}
