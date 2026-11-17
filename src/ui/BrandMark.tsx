import Svg, { G, Polyline, Rect } from 'react-native-svg';

/** The Studwise mark: a framed wall (plates and studs) braced by an orange check. Same drawing as the app icon. */
export function BrandMark({ size = 72, radius = 0.22 }: { size?: number; /** Corner rounding as a share of the size. */ radius?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024" accessibilityLabel="Studwise">
      <Rect width={1024} height={1024} rx={1024 * radius} fill="#2457F5" />
      <G fill="#FFFFFF">
        <Rect x={212} y={236} width={600} height={72} rx={22} />
        <Rect x={212} y={716} width={600} height={72} rx={22} />
        <Rect x={236} y={296} width={72} height={432} rx={14} />
        <Rect x={716} y={296} width={72} height={432} rx={14} />
      </G>
      <Polyline points="372,524 472,620 650,384" fill="none" stroke="#FF8A3D" strokeWidth={76} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
