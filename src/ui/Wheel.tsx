import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance, type ViewStyle } from 'react-native';

import { Text } from './text';
import { C } from './theme';

const ROW = 56;
const ROWS = 5; // rows on screen; the middle one is the choice
const PAD = ((ROWS - 1) / 2) * ROW;

export interface WheelOption { key: string; label: string; sub?: string; /** Translate the label (the app's own words), or show it as written (a language's own name). */ raw?: boolean }

/**
 * A scroll wheel: roll the list and the row that stops in the middle is the choice. Tapping a row rolls to it.
 * `onChange` fires once the wheel has stopped, not for every row that passes.
 */
export function Wheel({ options, value, onChange, label }: {
  options: WheelOption[]; value: string; onChange: (key: string) => void; label: string;
}) {
  const ref = useRef<ScrollViewInstance>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const at = Math.max(0, options.findIndex((o) => o.key === value));
  const [mid, setMid] = useState(at); // the row in the middle right now, while the wheel is still moving
  const placed = useRef(false);

  useEffect(() => () => { if (settle.current) clearTimeout(settle.current); }, []);

  const rollTo = (i: number, animated: boolean) => ref.current?.scrollTo({ y: i * ROW, animated });

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.min(options.length - 1, Math.max(0, Math.round(e.nativeEvent.contentOffset.y / ROW)));
    if (i !== mid) setMid(i);
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => { if (options[i] && options[i].key !== value) onChange(options[i].key); }, 140);
  };

  // The web has no snapToInterval; CSS scroll snapping does the same job there.
  const webSnap = Platform.OS === 'web' ? ({ scrollSnapType: 'y mandatory' } as ViewStyle) : null;
  const webRow = Platform.OS === 'web' ? ({ scrollSnapAlign: 'center' } as ViewStyle) : null;

  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label}
      style={{ height: ROW * ROWS, borderRadius: 18, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, overflow: 'hidden' }}>
      {/* The band that marks the choice. */}
      <View pointerEvents="none" style={{ position: 'absolute', left: 8, right: 8, top: PAD, height: ROW, borderRadius: 14, backgroundColor: C.accentTint, borderWidth: 2, borderColor: C.accent }} />
      <ScrollView ref={ref} nestedScrollEnabled showsVerticalScrollIndicator={false} scrollEventThrottle={16} onScroll={onScroll}
        snapToInterval={ROW} decelerationRate="fast" contentOffset={{ x: 0, y: at * ROW }}
        onLayout={() => { if (!placed.current) { placed.current = true; rollTo(at, false); } }}
        style={webSnap} contentContainerStyle={{ paddingVertical: PAD }}>
        {options.map((o, i) => {
          const far = Math.abs(i - mid);
          const on = far === 0;
          return (
            <Pressable key={o.key} accessibilityRole="radio" aria-checked={on} accessibilityState={{ checked: on }} accessibilityLabel={o.sub ? `${o.label}, ${o.sub}` : o.label}
              onPress={() => rollTo(i, true)}
              style={[{ height: ROW, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, opacity: on ? 1 : far === 1 ? 0.6 : 0.32 }, webRow]}>
              <Text raw={o.raw} numberOfLines={1} style={{ color: on ? C.accentDark : C.ink, fontSize: on ? 20 : 18, fontWeight: on ? '700' : '500' }}>{o.label}</Text>
              {o.sub ? <Text raw numberOfLines={1} style={{ color: C.muted, fontSize: 12 }}>{o.sub}</Text> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
