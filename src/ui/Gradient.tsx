import { useId } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

/** A color gradient filling its parent (put it first inside a card with overflow hidden). */
export function Gradient({ colors, from = [0, 0], to = [1, 1], glow, style }: {
  colors: string[]; from?: [number, number]; to?: [number, number]; glow?: string; style?: StyleProp<ViewStyle>;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }, style]}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={`g${id}`} x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]}>
            {colors.map((c, i) => <Stop key={i} offset={colors.length === 1 ? 0 : i / (colors.length - 1)} stopColor={c} />)}
          </LinearGradient>
          {glow ? (
            <RadialGradient id={`r${id}`} cx="0.85" cy="0.1" r="0.7">
              <Stop offset="0" stopColor={glow} stopOpacity="0.35" />
              <Stop offset="1" stopColor={glow} stopOpacity="0" />
            </RadialGradient>
          ) : null}
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#g${id})`} />
        {glow ? <Rect x="0" y="0" width="100%" height="100%" fill={`url(#r${id})`} /> : null}
      </Svg>
    </View>
  );
}
