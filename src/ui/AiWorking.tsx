import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Modal, View } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Brackets, Radar, Readout } from './hud';
import { C } from './kit';
import { TypingDots } from './motion';
import { MONO, Text } from './text';

export interface WorkJob {
  title: string;
  steps: string[];
  /** How long the show runs (3–8 s). If the real work takes longer, it waits at the last step. */
  ms: number;
}

/** 3 to 8 seconds, longer for more detailed work. */
export const workTime = (detail: number) => Math.round(Math.max(3000, Math.min(8000, 3000 + detail)));

/** Resolves once at least `ms` has passed since `startedAt` (so the work screen never flashes by). */
export const atLeast = (startedAt: number, ms: number) =>
  new Promise<void>((r) => setTimeout(r, Math.max(0, startedAt + ms - Date.now())));

/** Full-screen "Claude is working" view: a radar, the steps ticking off, and a progress readout. */
export function AiWorking({ job }: { job: WorkJob | null }) {
  return (
    <Modal visible={!!job} transparent animationType="fade" statusBarTranslucent>
      {job ? <Working job={job} /> : null}
    </Modal>
  );
}

function Working({ job }: { job: WorkJob }) {
  const [done, setDone] = useState(0);
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withTiming(0.94, { duration: job.ms, easing: Easing.out(Easing.quad) }));
    const each = job.ms / (job.steps.length + 0.5);
    const timers = job.steps.map((_, i) => setTimeout(() => setDone(i + 1), each * (i + 1)));
    return () => timers.forEach(clearTimeout);
  }, [job, p]);
  const bar = useAnimatedStyle(() => ({ width: `${p.get() * 100}%` }));
  const pct = Math.round(Math.min(94, (done / job.steps.length) * 94));
  return (
    <View style={{ flex: 1, backgroundColor: 'rgba(7,9,12,0.96)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <View style={{ width: '100%', maxWidth: 420, gap: 18, padding: 20, borderWidth: 1, borderColor: 'rgba(255,122,26,0.35)', backgroundColor: 'rgba(255,122,26,0.04)' }}>
        <Brackets />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Readout color={C.accentDark}>Claude · working</Readout>
          <Text style={{ fontFamily: MONO, color: C.accent, fontSize: 13 }}>{String(pct).padStart(2, '0')}%</Text>
        </View>
        <View style={{ alignItems: 'center' }}><Radar size={150} /></View>
        <Text style={{ color: C.ink, fontSize: 22, fontWeight: '700', textAlign: 'center' }}>{job.title}</Text>
        <View style={{ height: 4, backgroundColor: C.line }}>
          <Animated.View style={[{ height: 4, backgroundColor: C.accent, shadowColor: C.accent, shadowOpacity: 1, shadowRadius: 8 }, bar]} />
        </View>
        <View style={{ gap: 9 }}>
          {job.steps.map((s, i) => {
            const state = i < done ? 'done' : i === done ? 'now' : 'next';
            return (
              <Animated.View key={s} entering={FadeIn.delay(i * 80)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, opacity: state === 'next' ? 0.35 : 1 }}>
                <View style={{ width: 18, alignItems: 'center' }}>
                  {state === 'done' ? <Ionicons name="checkmark" size={16} color={C.okInk} />
                    : state === 'now' ? <View style={{ width: 8, height: 8, backgroundColor: C.accent }} />
                    : <View style={{ width: 8, height: 8, borderWidth: 1, borderColor: C.muted }} />}
                </View>
                <Text style={{ flex: 1, fontFamily: MONO, fontSize: 13, color: state === 'done' ? C.ink2 : C.ink }}>{s}</Text>
                {state === 'now' ? <TypingDots /> : null}
              </Animated.View>
            );
          })}
        </View>
      </View>
    </View>
  );
}
