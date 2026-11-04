import { useEffect, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

/*
 * A burst of confetti for the good moments: the client signs, a payment comes in, a room's tasks are all done.
 * Call `celebrate()` from anywhere; <ConfettiHost /> in the root layout draws it over every screen.
 */
type Listener = () => void;
const listeners = new Set<Listener>();
export function celebrate() {
  listeners.forEach((l) => l());
}

const COLORS = ['#FACC15', '#FDE68A', '#38BDF8', '#34D399', '#F472B6', '#FFFFFF'];

export function ConfettiHost() {
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    const l = () => setBurst((b) => b + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  useEffect(() => {
    if (!burst) return;
    const t = setTimeout(() => setBurst(0), 2600);
    return () => clearTimeout(t);
  }, [burst]);
  if (!burst) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, overflow: 'hidden' }}>
      {Array.from({ length: 46 }, (_, i) => <Piece key={`${burst}-${i}`} i={i} />)}
    </View>
  );
}

// Deterministic "random" so each piece has its own path without calling Math.random during render.
const rnd = (i: number, k: number) => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

function Piece({ i }: { i: number }) {
  const { width, height } = useWindowDimensions();
  const p = useSharedValue(0);
  const startX = width / 2 + (rnd(i, 1) - 0.5) * 60;
  const dx = (rnd(i, 2) - 0.5) * width * 1.1;
  const up = height * (0.25 + rnd(i, 3) * 0.3);
  const spin = (rnd(i, 4) - 0.5) * 1080;
  const size = 6 + rnd(i, 5) * 7;
  useEffect(() => {
    p.set(withDelay(rnd(i, 6) * 120, withTiming(1, { duration: 1900 + rnd(i, 7) * 600, easing: Easing.out(Easing.quad) })));
  }, [p, i]);
  const anim = useAnimatedStyle(() => {
    const t = p.get();
    // Shoots up, then falls with gravity while drifting sideways and spinning.
    const y = height * 0.62 - up * Math.sin(Math.min(1, t * 1.6) * Math.PI / 2) + Math.max(0, t - 0.55) ** 2 * height * 2.2;
    return { opacity: t < 0.85 ? 1 : (1 - t) / 0.15, transform: [{ translateX: startX + dx * t }, { translateY: y }, { rotate: `${spin * t}deg` }] };
  });
  return (
    <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: size, height: size * (rnd(i, 8) > 0.5 ? 0.45 : 1), borderRadius: rnd(i, 9) > 0.6 ? size : 2, backgroundColor: COLORS[i % COLORS.length] }, anim]} />
  );
}
