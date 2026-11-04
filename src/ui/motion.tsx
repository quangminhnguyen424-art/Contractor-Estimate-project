import { useEffect, type ReactNode } from 'react';
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
export function ScanBeam({ height, color = '#FACC15' }: { height: number; color?: string }) {
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
export function Progress({ value, color = '#FACC15', track = '#334155', height = 8 }: { value: number; color?: string; track?: string; height?: number }) {
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
export function TypingDots({ color = '#FACC15' }: { color?: string }) {
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
