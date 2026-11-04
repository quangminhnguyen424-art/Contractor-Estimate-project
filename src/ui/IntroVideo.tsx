import { useEffect, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withTiming, ZoomIn } from 'react-native-reanimated';

import { Art } from './art';
import { Brackets, Readout, TypeLines } from './hud';
import { Button, C } from './kit';
import { Wave } from './motion';
import { MONO, Text } from './text';

const SCENE_MS = 4200;

const SCENES = [
  { title: 'Say the job.\nGet the price.', art: null },
  { title: 'Scan rooms in 3D.\nThe plan draws itself.', art: 'scan' as const },
  { title: 'Photos for your crew.\nUpdates for your client.', art: 'photos' as const },
  { title: 'Sign, invoice,\nget paid.', art: 'sign' as const },
];

/** The welcome "video": four short animated scenes that play on their own before setup. */
export function IntroVideo({ onDone }: { onDone: () => void }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setI((n) => (n + 1) % SCENES.length), SCENE_MS);
    return () => clearTimeout(t);
  }, [i]);
  const s = SCENES[i];
  const artW = Math.min(width - 48, 330);
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, padding: 20, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16, gap: 14 }}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {SCENES.map((_, k) => <Bar key={k} state={k < i ? 'done' : k === i ? 'now' : 'next'} />)}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Readout color={C.accent}>Bidwell AI</Readout>
        <Pressable accessibilityRole="button" onPress={onDone} hitSlop={10}><Readout>Skip ›</Readout></Pressable>
      </View>

      {/* Tap the left or right side to go back or forward, like a story. */}
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Animated.View key={i} entering={FadeIn.duration(450)} exiting={FadeOut.duration(250)} style={{ alignItems: 'center', gap: 24 }}>
          {s.art ? <Art name={s.art} width={artW} beam={s.art === 'scan'} /> : <Talk />}
          <Text style={{ color: C.ink, fontSize: 28, fontWeight: '700', textAlign: 'center', lineHeight: 34 }}>{s.title}</Text>
        </Animated.View>
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, flexDirection: 'row' }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Previous" style={{ flex: 1 }} onPress={() => setI((n) => (n + SCENES.length - 1) % SCENES.length)} />
          <Pressable accessibilityRole="button" accessibilityLabel="Next" style={{ flex: 1 }} onPress={() => setI((n) => (n + 1) % SCENES.length)} />
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <Button title="Get started — free" icon="arrow-forward" onPress={onDone} />
        <Text style={{ color: C.muted, textAlign: 'center', fontSize: 12, fontFamily: MONO }}>MADE FOR CONTRACTORS · ENGLISH & TIẾNG VIỆT</Text>
      </View>
    </View>
  );
}

function Bar({ state }: { state: 'done' | 'now' | 'next' }) {
  const w = useSharedValue(state === 'done' ? 1 : 0);
  useEffect(() => {
    w.set(state === 'now' ? 0 : state === 'done' ? 1 : 0);
    if (state === 'now') w.set(withTiming(1, { duration: SCENE_MS, easing: Easing.linear }));
  }, [state, w]);
  const anim = useAnimatedStyle(() => ({ width: `${w.get() * 100}%` }));
  return (
    <View style={{ flex: 1, height: 3, backgroundColor: C.line }}>
      <Animated.View style={[{ height: 3, backgroundColor: C.accent }, anim]} />
    </View>
  );
}

/** Scene 1: someone talking, the words typing out, then the price popping up. */
function Talk() {
  return (
    <View style={{ alignItems: 'center', gap: 16 }}>
      <View style={{ width: 120, height: 120, borderWidth: 1, borderColor: 'rgba(255,122,26,0.4)', backgroundColor: 'rgba(255,122,26,0.08)', alignItems: 'center', justifyContent: 'center' }}>
        <Brackets />
        <Wave color={C.accent} bars={6} height={54} />
      </View>
      <View style={{ paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, maxWidth: 300 }}>
        <TypeLines lines={['"hall bath, tub to tiled shower, new vanity"']} />
      </View>
      <Animated.View entering={ZoomIn.delay(1800).springify()} style={{ paddingHorizontal: 22, paddingVertical: 12, backgroundColor: C.accent, alignItems: 'center' }}>
        <Text style={{ color: C.onAccent, fontFamily: MONO, fontSize: 11 }}>CLIENT PRICE</Text>
        <Text style={{ color: C.onAccent, fontSize: 30, fontWeight: '700', fontFamily: MONO }}>$15,515</Text>
      </Animated.View>
    </View>
  );
}
