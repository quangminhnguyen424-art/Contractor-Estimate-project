import { useEffect, useState, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { C } from './kit';
import { MONO, Text } from './text';

/*
 * The "job-site HUD" pieces: corner brackets around important panels, a radar sweep, a blinking status light,
 * text that types itself out, and small capital readout labels.
 */

/** Orange corner marks around a panel (like a camera viewfinder). Put inside a relatively positioned box. */
export function Brackets({ color = C.accent, size = 14, weight = 3 }: { color?: string; size?: number; weight?: number }) {
  const b = (pos: ViewStyle) => <View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size, borderColor: color }, pos]} />;
  return (
    <>
      {b({ left: -1, top: -1, borderLeftWidth: weight, borderTopWidth: weight })}
      {b({ right: -1, top: -1, borderRightWidth: weight, borderTopWidth: weight })}
      {b({ left: -1, bottom: -1, borderLeftWidth: weight, borderBottomWidth: weight })}
      {b({ right: -1, bottom: -1, borderRightWidth: weight, borderBottomWidth: weight })}
    </>
  );
}

/** A panel with corner brackets and an orange tint: for the one main thing on a screen. */
export function HudPanel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ position: 'relative', padding: 16, backgroundColor: 'rgba(255,122,26,0.06)', borderWidth: 1, borderColor: 'rgba(255,122,26,0.35)', gap: 10 }, style]}>
      <Brackets />
      {children}
    </View>
  );
}

/** Small capital readout label ("NEW ESTIMATE", "TODAY"). */
export function Readout({ children, color = C.muted, style }: { children: ReactNode; color?: string; style?: StyleProp<ViewStyle> }) {
  return <Text style={[{ fontFamily: MONO, fontSize: 12, letterSpacing: 0.8, color, textTransform: 'uppercase' }, style as object]}>{children}</Text>;
}

/** A radar that sweeps round and round, with a blip. */
export function Radar({ size = 96 }: { size?: number }) {
  const r = useSharedValue(0);
  const blip = useSharedValue(0);
  useEffect(() => {
    r.set(withRepeat(withTiming(360, { duration: 3200, easing: Easing.linear }), -1, false));
    blip.set(withRepeat(withSequence(withTiming(1, { duration: 1400 }), withTiming(0, { duration: 0 })), -1, false));
  }, [r, blip]);
  const sweep = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.get()}deg` }] }));
  const ring = useAnimatedStyle(() => ({ opacity: 1 - blip.get(), transform: [{ scale: 0.6 + blip.get() * 1.6 }] }));
  const half = size / 2;
  return (
    <View style={{ width: size, height: size, borderRadius: half, borderWidth: 1, borderColor: 'rgba(255,122,26,0.5)', overflow: 'hidden', backgroundColor: 'rgba(255,122,26,0.06)' }}>
      <View style={{ position: 'absolute', left: half - 0.5, top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,122,26,0.28)' }} />
      <View style={{ position: 'absolute', top: half - 0.5, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,122,26,0.28)' }} />
      <View style={{ position: 'absolute', left: size * 0.2, top: size * 0.2, width: size * 0.6, height: size * 0.6, borderRadius: size, borderWidth: 1, borderColor: 'rgba(255,122,26,0.22)' }} />
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: size, height: size }, sweep]}>
        {/* The bright edge of the sweep and a fading wedge behind it. */}
        <View style={{ position: 'absolute', left: half, top: 0, width: half, height: half, borderTopRightRadius: half, backgroundColor: 'rgba(255,122,26,0.22)' }} />
        <View style={{ position: 'absolute', left: half - 1, top: 0, width: 2, height: half, backgroundColor: C.accent }} />
      </Animated.View>
      <View style={{ position: 'absolute', left: size * 0.64, top: size * 0.27, width: 7, height: 7, borderRadius: 4, backgroundColor: '#FFB37A' }} />
      <Animated.View style={[{ position: 'absolute', left: size * 0.64 - 3, top: size * 0.27 - 3, width: 13, height: 13, borderRadius: 7, borderWidth: 1, borderColor: '#FFB37A' }, ring]} />
    </View>
  );
}

/** A small square light that blinks (live status). */
export function Blink({ color = C.okInk, size = 7, on = true }: { color?: string; size?: number; on?: boolean }) {
  const v = useSharedValue(1);
  useEffect(() => {
    v.set(on ? withRepeat(withSequence(withTiming(0.15, { duration: 550 }), withTiming(1, { duration: 550 })), -1, false) : withTiming(1));
  }, [v, on]);
  const anim = useAnimatedStyle(() => ({ opacity: v.get() }));
  return <Animated.View style={[{ width: size, height: size, backgroundColor: color }, anim]} />;
}

/** Text that types itself out, pauses, and moves on to the next line (examples of what to say). */
export function TypeLines({ lines, style }: { lines: string[]; style?: object }) {
  const [i, setI] = useState(0);
  const [n, setN] = useState(0);
  useEffect(() => {
    const line = lines[i % lines.length] ?? '';
    const t = setTimeout(() => {
      if (n < line.length) setN(n + 1);
      else { setN(0); setI(i + 1); }
    }, n < line.length ? 45 : 1800);
    return () => clearTimeout(t);
  }, [i, n, lines]);
  const line = lines[i % lines.length] ?? '';
  return (
    <Text style={[{ fontFamily: MONO, fontSize: 13, color: C.ink }, style]} numberOfLines={1}>
      {line.slice(0, n)}<Text style={{ color: C.accent }}>▌</Text>
    </Text>
  );
}
