import { useRef, useState } from 'react';
import { Platform, Pressable, View, type GestureResponderEvent } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { signatureSvg } from '@/engine/contract';

import { P } from './kit';
import { Text } from './text';

/**
 * Sign with a finger. Strokes are kept in the pad's own coordinates (width × height) and drawn as smooth lines,
 * the same way they appear on the PDF. `onDrawing` lets the screen stop scrolling while the finger is down.
 */
export function SignaturePad({ width, height = 170, strokes, onChange, onDrawing }: {
  width: number; height?: number; strokes: number[][]; onChange: (s: number[][]) => void; onDrawing?: (on: boolean) => void;
}) {
  const cur = useRef<number[] | null>(null);
  const [live, setLive] = useState<number[] | null>(null);

  const at = (e: GestureResponderEvent) => [
    Math.round(Math.max(0, Math.min(width, e.nativeEvent.locationX)) * 10) / 10,
    Math.round(Math.max(0, Math.min(height, e.nativeEvent.locationY)) * 10) / 10,
  ];
  const start = (e: GestureResponderEvent) => {
    cur.current = at(e);
    setLive(cur.current);
    onDrawing?.(true);
  };
  const move = (e: GestureResponderEvent) => {
    if (!cur.current) return;
    const [x, y] = at(e);
    const n = cur.current.length;
    if (Math.hypot(x - cur.current[n - 2], y - cur.current[n - 1]) < 1.5) return;
    cur.current = [...cur.current, x, y];
    setLive(cur.current);
  };
  const end = () => {
    const s = cur.current;
    cur.current = null;
    setLive(null);
    onDrawing?.(false);
    if (s && s.length >= 2) onChange([...strokes, s.length === 2 ? [s[0], s[1], s[0] + 1, s[1] + 1] : s]);
  };

  const all = live ? [...strokes, live] : strokes;
  return (
    <View style={{ gap: 6 }}>
      <View style={{ width, height, borderRadius: 14, backgroundColor: P.paper, overflow: 'hidden' }}>
        <View pointerEvents="none" style={{ position: 'absolute', left: 18, right: 18, bottom: 34, height: 1.5, backgroundColor: '#CBD5E1' }} />
        <Text style={{ position: 'absolute', left: 18, bottom: 12, color: '#94A3B8', fontSize: 12 }}>✕ Sign here</Text>
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0 }}>
          <SvgXml xml={signatureSvg({ strokes: all, w: width, h: height }, '#0F172A')} width={width} height={height} />
        </View>
        <View
          accessibilityLabel="Signature pad"
          style={[{ position: 'absolute', left: 0, top: 0, width, height }, Platform.OS === 'web' ? ({ touchAction: 'none', userSelect: 'none' } as object) : null]}
          onStartShouldSetResponderCapture={() => true}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponderCapture={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderTerminationRequest={() => false}
          onResponderGrant={start}
          onResponderMove={move}
          onResponderRelease={end}
          onResponderTerminate={end}
        />
      </View>
      {strokes.length ? (
        <Pressable accessibilityRole="button" onPress={() => onChange([])} hitSlop={8} style={{ alignSelf: 'flex-end' }}>
          <Text style={{ color: '#94A3B8', fontWeight: '600' }}>Clear signature</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
