import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing, FadeInDown, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';

/** Content that slides up softly as the screen opens. `index` staggers a list so items arrive one after another. */
export function Reveal({ children, index = 0, style }: { children: ReactNode; index?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <Animated.View entering={FadeInDown.duration(420).delay(Math.min(index, 8) * 55).easing(Easing.out(Easing.cubic))} style={style}>
      {children}
    </Animated.View>
  );
}

const OUTER_KEYS = ['flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf', 'width', 'minWidth', 'maxWidth', 'margin', 'marginTop', 'marginBottom',
  'marginLeft', 'marginRight', 'marginHorizontal', 'marginVertical', 'position', 'top', 'left', 'right', 'bottom'] as const;

/** A button-like area that gives a little under the finger, like a real button. */
export function PressScale({ children, style, scaleTo = 0.96, disabled, ...props }: PressableProps & {
  children: ReactNode; style?: StyleProp<ViewStyle>; scaleTo?: number;
}) {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  // Size and position belong on the touch area (so "flex: 1" in a row still works); looks go on the moving part.
  const flat = (StyleSheet.flatten(style) ?? {}) as ViewStyle;
  const outer: ViewStyle = {};
  const inner: ViewStyle = { ...flat };
  for (const k of OUTER_KEYS) if (flat[k] !== undefined) { (outer as Record<string, unknown>)[k] = flat[k]; delete (inner as Record<string, unknown>)[k]; }
  if (outer.flex || outer.flexGrow) (inner as Record<string, unknown>).flexGrow = 1;
  return (
    <Pressable
      {...props}
      style={outer}
      disabled={disabled}
      onPressIn={(e) => { scale.set(withSpring(scaleTo, { damping: 18, stiffness: 400 })); props.onPressIn?.(e); }}
      onPressOut={(e) => { scale.set(withSpring(1, { damping: 14, stiffness: 300 })); props.onPressOut?.(e); }}>
      <Animated.View style={[inner, anim]}>{children}</Animated.View>
    </Pressable>
  );
}

/** Gently breathes forever: for the scan button, the microphone while listening, live status dots. */
export function Pulse({ children, active = true, style, min = 0.94, max = 1.04 }: {
  children: ReactNode; active?: boolean; style?: StyleProp<ViewStyle>; min?: number; max?: number;
}) {
  const v = useSharedValue(1);
  useEffect(() => {
    v.set(active
      ? withRepeat(withSequence(withTiming(max, { duration: 900 }), withTiming(min, { duration: 900 })), -1, true)
      : withTiming(1, { duration: 200 }));
  }, [active, v, min, max]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: v.get() }] }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

/** A line that sweeps up and down over a picture, like a scanner. */
export function ScanBeam({ height, color = '#FF7A1A' }: { height: number; color?: string }) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.set(withRepeat(withTiming(height - 6, { duration: 1800, easing: Easing.inOut(Easing.quad) }), -1, true));
  }, [height, y]);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 8, right: 8, top: 0, height: 4, borderRadius: 2, backgroundColor: color,
      shadowColor: color, shadowOpacity: 0.9, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } }, anim]} />
  );
}

/** Progress bar that fills smoothly to its value (0–1). */
export function Progress({ value, color = '#2457F5', track = '#E7ECF4', height = 8 }: { value: number; color?: string; track?: string; height?: number }) {
  const w = useSharedValue(0);
  useEffect(() => {
    w.set(withDelay(150, withTiming(Math.max(0, Math.min(1, value || 0)), { duration: 700, easing: Easing.out(Easing.cubic) })));
  }, [value, w]);
  const anim = useAnimatedStyle(() => ({ width: `${w.get() * 100}%` }));
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: track, overflow: 'hidden' }}>
      <Animated.View style={[{ height, borderRadius: height / 2, backgroundColor: color }, anim]} />
    </View>
  );
}

/** Three dots that bounce while Claude is thinking. */
export function TypingDots({ color = '#FF7A1A' }: { color?: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 5, paddingVertical: 6 }}>
      {[0, 1, 2].map((i) => <Dot key={i} delay={i * 160} color={color} />)}
    </View>
  );
}

function Dot({ delay, color }: { delay: number; color: string }) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.set(withDelay(delay, withRepeat(withSequence(withTiming(-5, { duration: 280 }), withTiming(0, { duration: 280 })), -1, false)));
  }, [delay, y]);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
  return <Animated.View style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }, anim]} />;
}

/** Floats gently up and down, like it's hanging in the air (illustrations, hero art). */
export function Float({ children, style, distance = 6, duration = 2600 }: { children: ReactNode; style?: StyleProp<ViewStyle>; distance?: number; duration?: number }) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.set(withRepeat(withSequence(withTiming(-distance, { duration, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration, easing: Easing.inOut(Easing.sin) })), -1, false));
  }, [y, distance, duration]);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

/** A four-point star that twinkles (grows, glows, fades) on a loop. Position it with `style`. */
export function Twinkle({ size = 14, color = '#FFB37A', delay = 0, style }: { size?: number; color?: string; delay?: number; style?: StyleProp<ViewStyle> }) {
  const v = useSharedValue(0.3);
  useEffect(() => {
    v.set(withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: 700, easing: Easing.out(Easing.quad) }), withTiming(0.3, { duration: 900, easing: Easing.in(Easing.quad) })), -1, false)));
  }, [v, delay]);
  const anim = useAnimatedStyle(() => ({ opacity: v.get(), transform: [{ scale: 0.6 + v.get() * 0.5 }, { rotate: `${v.get() * 45}deg` }] }));
  const arm = { position: 'absolute' as const, backgroundColor: color, borderRadius: size };
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style, anim]}>
      <View style={[arm, { width: size * 0.22, height: size }]} />
      <View style={[arm, { width: size, height: size * 0.22 }]} />
      <View style={{ width: size * 0.4, height: size * 0.4, borderRadius: size, backgroundColor: color, shadowColor: color, shadowOpacity: 1, shadowRadius: size / 2 }} />
    </Animated.View>
  );
}

/** A soft colored glow that slowly breathes behind something (hero cards, the + button). */
export function Glow({ color = '#FF7A1A', size = 220, style }: { color?: string; size?: number; style?: StyleProp<ViewStyle> }) {
  const v = useSharedValue(0.35);
  useEffect(() => {
    v.set(withRepeat(withSequence(withTiming(0.6, { duration: 2200 }), withTiming(0.35, { duration: 2200 })), -1, false));
  }, [v]);
  const anim = useAnimatedStyle(() => ({ opacity: v.get(), transform: [{ scale: 0.9 + v.get() * 0.25 }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color,
      shadowColor: color, shadowOpacity: 1, shadowRadius: size / 2, filter: [{ blur: size / 3 }] } as ViewStyle, style, anim]} />
  );
}

/** Bars that bounce like a sound meter, while the microphone is listening. */
export function Wave({ color = '#0F172A', bars = 4, height = 18 }: { color?: string; bars?: number; height?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height }}>
      {Array.from({ length: bars }, (_, i) => <WaveBar key={i} color={color} height={height} delay={i * 120} />)}
    </View>
  );
}

function WaveBar({ color, height, delay }: { color: string; height: number; delay: number }) {
  const v = useSharedValue(0.3);
  useEffect(() => {
    v.set(withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: 260 }), withTiming(0.3, { duration: 320 })), -1, false)));
  }, [v, delay]);
  const anim = useAnimatedStyle(() => ({ height: height * v.get() }));
  return <Animated.View style={[{ width: 3, borderRadius: 2, backgroundColor: color }, anim]} />;
}

/** A sheen that sweeps across a card now and then, to draw the eye (main call to action). */
export function Shine({ width, height, every = 4200 }: { width: number; height: number; every?: number }) {
  const x = useSharedValue(-width);
  useEffect(() => {
    x.set(withRepeat(withSequence(withTiming(-width, { duration: 0 }), withDelay(every, withTiming(width * 1.4, { duration: 1100, easing: Easing.inOut(Easing.quad) }))), -1, false));
  }, [x, width, every]);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }, { rotate: '20deg' }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: -height, width: width * 0.22, height: height * 3, backgroundColor: 'rgba(255,255,255,0.18)' }, anim]} />
  );
}

/** A number that counts up to its value when it first appears or changes (money totals). */
export function useCountUp(value: number, duration = 900): number {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = Date.now();
    const from = 0;
    const step = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setShown(from + (value - from) * eased);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return shown;
}
