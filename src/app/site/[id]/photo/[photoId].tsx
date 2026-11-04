import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Image, Platform, Pressable, useWindowDimensions, View, type GestureResponderEvent } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { Text } from '@/ui/text';
import { newId } from '@/engine/format';
import { markupSvg, COLOR_HEX, type MarkColor, type MarkupShape, type PhotoKind, type ShapeKind, type SitePhoto, type SiteRoom } from '@/engine/site';
import { useApp } from '@/store/AppContext';
import { Button, C, Card, Field, Muted, Screen, Segmented } from '@/ui/kit';
import { confirmAction, notify } from '@/ui/notify';
import { usePhotoUri } from '@/ui/photoStore';
import { KIND_LABEL } from '@/ui/SitePhotoView';

const TOOLS: { value: ShapeKind; label: string }[] = [
  { value: 'arrow', label: 'Arrow' },
  { value: 'circle', label: 'Circle' },
  { value: 'line', label: 'Measure' },
  { value: 'text', label: 'Text' },
];

/** Draw on a job photo (arrows, circles, measurements, labels) and write what the crew should do there. */
export default function PhotoScreen() {
  const { id, photoId, room: roomId } = useLocalSearchParams<{ id: string; photoId: string; room: string }>();
  const { projects, updateProject, deletePhotosLater } = useApp();
  const { width } = useWindowDimensions();
  const p = projects.find((x) => x.id === id);
  const room = p?.rooms.find((r) => r.id === roomId);
  const photo = room?.photos.find((ph) => ph.id === photoId);
  const [tool, setTool] = useState<ShapeKind>('arrow');
  const [color, setColor] = useState<MarkColor>('red');
  // The shape being drawn lives in a ref (always current, even on a fast flick) and is mirrored to state to show it.
  const draftRef = useRef<MarkupShape | null>(null);
  const [draft, setDraftState] = useState<MarkupShape | null>(null);
  const setDraft = (s: MarkupShape | null) => { draftRef.current = s; setDraftState(s); };
  const [drawing, setDrawing] = useState(false);
  const [pendingLabel, setPendingLabel] = useState<MarkupShape | null>(null);
  const [labelText, setLabelText] = useState('');
  const [note, setNote] = useState(photo?.note ?? '');
  const src = usePhotoUri(photo?.uri ?? '');

  if (!p || !room || !photo) return <Screen><Muted>This photo was deleted.</Muted></Screen>;
  const dispW = Math.min(width, 760) - 32;
  const dispH = Math.round((dispW * photo.h) / photo.w);
  const k = photo.w / dispW; // screen points -> photo pixels
  const photoNo = room.photos.findIndex((ph) => ph.id === photo.id) + 1;

  const setRoom = (fn: (r: SiteRoom) => SiteRoom) =>
    updateProject(p.id, (x) => ({ ...x, rooms: x.rooms.map((r) => (r.id === room.id ? fn(r) : r)) }));
  const setPhoto = (patch: Partial<SitePhoto>) =>
    setRoom((r) => ({ ...r, photos: r.photos.map((ph) => (ph.id === photo.id ? { ...ph, ...patch } : ph)) }));
  const commit = (s: MarkupShape) => setPhoto({ markup: [...photo.markup, s] });

  const point = (e: GestureResponderEvent) => {
    const x = Math.max(0, Math.min(dispW, e.nativeEvent.locationX));
    const y = Math.max(0, Math.min(dispH, e.nativeEvent.locationY));
    return { x: x * k, y: y * k };
  };

  const onGrant = (e: GestureResponderEvent) => {
    if (pendingLabel) return;
    const pt = point(e);
    if (tool === 'text') {
      setPendingLabel({ id: newId(), kind: 'text', color, x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y });
      setLabelText('');
      return;
    }
    setDrawing(true);
    setDraft({ id: newId(), kind: tool, color, x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y });
  };
  const onMove = (e: GestureResponderEvent) => {
    const d = draftRef.current;
    if (!d) return;
    const pt = point(e);
    setDraft({ ...d, x2: pt.x, y2: pt.y });
  };
  /** The system took the touch away (a call, a swipe from the edge): drop the half-drawn shape. */
  const onTerminate = () => {
    setDraft(null);
    setDrawing(false);
  };
  const onRelease = (e: GestureResponderEvent) => {
    const d = draftRef.current;
    setDraft(null);
    setDrawing(false);
    if (!d) return;
    // The finger's last spot, even if no move event came for it (ignored if the device didn't report one).
    const ne = e.nativeEvent;
    const reported = Number.isFinite(ne.locationX) && Number.isFinite(ne.locationY) && (ne.locationX !== 0 || ne.locationY !== 0);
    const end = reported ? point(e) : { x: d.x2, y: d.y2 };
    const s = { ...d, x2: end.x, y2: end.y };
    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    if (len < 12 * k) return; // a tap, not a drag
    if (s.kind === 'line') { setPendingLabel(s); setLabelText(''); return; }
    commit(s);
  };

  const finishLabel = (skip: boolean) => {
    if (!pendingLabel) return;
    const text = labelText.trim();
    if (pendingLabel.kind === 'text' && (skip || !text)) { setPendingLabel(null); return; }
    commit({ ...pendingLabel, ...(text && !skip ? { text } : {}) });
    setPendingLabel(null);
  };

  const shapes = [...photo.markup, ...(draft ? [draft] : []), ...(pendingLabel && pendingLabel.kind === 'line' ? [pendingLabel] : [])];

  return (
    <Screen scrollEnabled={!drawing}>
      <Stack.Screen options={{ title: `${room.name} · Photo ${photoNo}` }} />
      <View style={{ width: dispW, height: dispH, borderRadius: 8, overflow: 'hidden', backgroundColor: '#222' }}>
        {src ? <Image source={{ uri: src }} style={{ width: dispW, height: dispH }} accessibilityLabel={`Photo ${photoNo}`} /> : null}
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0 }}>
          <SvgXml xml={markupSvg(shapes, photo.w, photo.h)} width={dispW} height={dispH} />
        </View>
        <View
          accessibilityLabel="Drawing area"
          style={[{ position: 'absolute', left: 0, top: 0, width: dispW, height: dispH },
            // In a browser, stop the page from scrolling or zooming while a finger draws on the photo.
            Platform.OS === 'web' ? ({ touchAction: 'none', userSelect: 'none' } as object) : null]}
          onStartShouldSetResponderCapture={() => !pendingLabel}
          onStartShouldSetResponder={() => !pendingLabel}
          onMoveShouldSetResponderCapture={() => !pendingLabel}
          onMoveShouldSetResponder={() => !pendingLabel}
          onResponderTerminationRequest={() => false}
          onResponderGrant={onGrant}
          onResponderMove={onMove}
          onResponderRelease={onRelease}
          onResponderTerminate={onTerminate}
        />
      </View>

      {pendingLabel ? (
        <Card>
          <Field label={pendingLabel.kind === 'line' ? 'Measurement (optional)' : 'Label'} value={labelText} onChangeText={setLabelText}
            placeholder={pendingLabel.kind === 'line' ? 'e.g. 44 in AFF' : 'e.g. Move outlet here'} autoFocus maxLength={60} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button kind="secondary" title={pendingLabel.kind === 'line' ? 'No label' : 'Cancel'} style={{ flex: 1 }} onPress={() => finishLabel(true)} />
            <Button title="Add" style={{ flex: 1 }} disabled={pendingLabel.kind === 'text' && !labelText.trim()} onPress={() => finishLabel(false)} />
          </View>
        </Card>
      ) : (
        <>
          <Segmented<ShapeKind> value={tool} onChange={setTool} options={TOOLS} />
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            {(['red', 'yellow', 'white'] as MarkColor[]).map((c) => (
              <Pressable key={c} accessibilityRole="button" accessibilityLabel={`${c} color`} accessibilityState={{ selected: color === c }} onPress={() => setColor(c)}
                style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: COLOR_HEX[c], borderWidth: color === c ? 3 : 1, borderColor: color === c ? C.ink : C.line }} />
            ))}
            <View style={{ flex: 1 }} />
            <Button kind="ghost" title="Undo" disabled={!photo.markup.length} onPress={() => setPhoto({ markup: photo.markup.slice(0, -1) })} />
            <Button kind="ghost" title="Clear" disabled={!photo.markup.length}
              onPress={() => confirmAction('Clear all drawings?', 'The photo itself stays.', 'Clear', () => setPhoto({ markup: [] }))} />
          </View>
          <Muted style={{ fontSize: 13 }}>
            {tool === 'text' ? 'Tap where the label goes.' : tool === 'line' ? 'Drag across what you measured, then type the size.' : `Drag on the photo to draw ${tool === 'arrow' ? 'an arrow' : 'a circle'}.`}
          </Muted>
        </>
      )}

      <Card>
        <Field label="What to do here" multiline value={note} onChangeText={(v) => { setNote(v); setPhoto({ note: v }); }}
          placeholder="e.g. Cut the drywall back to the stud and move this outlet 12 in left" help="Tap the microphone on your keyboard to talk." />
        <Segmented<PhotoKind> value={photo.kind} onChange={(kind) => setPhoto({ kind })}
          options={(['before', 'progress', 'after'] as PhotoKind[]).map((v) => ({ value: v, label: KIND_LABEL[v] }))} />
        <Button kind="secondary" title="Make this a task"
          onPress={() => {
            const text = note.trim() || `See photo ${photoNo}`;
            setRoom((r) => ({ ...r, tasks: [...r.tasks, { id: newId(), text, done: false, photoId: photo.id }] }));
            notify('Task added', text);
          }} />
      </Card>

      <Pressable accessibilityRole="button" style={{ alignSelf: 'center', padding: 12 }}
        onPress={() => confirmAction('Delete this photo?', 'Its drawings are deleted too.', 'Delete', () => {
          setRoom((r) => ({
            ...r, photos: r.photos.filter((ph) => ph.id !== photo.id),
            tasks: r.tasks.map((t) => ({ ...t, photoId: t.photoId === photo.id ? undefined : t.photoId, afterPhotoId: t.afterPhotoId === photo.id ? undefined : t.afterPhotoId })),
          }));
          deletePhotosLater([photo.uri]);
          router.back();
        })}>
        <Text style={{ color: C.danger, fontWeight: '600' }}>Delete photo</Text>
      </Pressable>
    </Screen>
  );
}
