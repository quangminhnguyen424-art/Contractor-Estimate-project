import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { Float, ScanBeam, Twinkle } from './motion';

/*
 * Illustrations drawn for this app (simple vector scenes in the app's colors): near-black, safety orange,
 * sky blue and slate. Each is a viewBox of 320 x 200 and scales to any width.
 */
// Light palette (design A): blue line drawings on white, orange highlights.
const Y = '#FF6B1A', Y2 = '#F08A4B', SKY = '#2457F5', SKY2 = '#7C9BF8', SL = '#E3E8F0', SL2 = '#C9D6FF', INK = '#FFFFFF', W = '#3B4659';

const grid = `<g stroke="${SL}" stroke-width="1" opacity=".55">${Array.from({ length: 11 }, (_, i) => `<line x1="${i * 32}" y1="0" x2="${i * 32}" y2="200"/>`).join('')}${Array.from({ length: 7 }, (_, i) => `<line x1="0" y1="${i * 32}" x2="320" y2="${i * 32}"/>`).join('')}</g>`;
const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200">${body}</svg>`;

export const ART = {
  /** A house going up on a blueprint, with a measuring line and Claude's spark. */
  hero: svg(`${grid}
<path d="M70 168 L70 98 L150 46 L230 98 L230 168Z" fill="${INK}" stroke="${SKY}" stroke-width="3" stroke-linejoin="round"/>
<path d="M56 106 L150 40 L244 106" fill="none" stroke="${Y}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="96" y="112" width="36" height="30" rx="3" fill="none" stroke="${SKY}" stroke-width="3"/><line x1="114" y1="112" x2="114" y2="142" stroke="${SKY}" stroke-width="2"/><line x1="96" y1="127" x2="132" y2="127" stroke="${SKY}" stroke-width="2"/>
<rect x="160" y="118" width="34" height="50" rx="3" fill="${SL2}"/><circle cx="187" cy="145" r="2.6" fill="${Y}"/>
<line x1="70" y1="184" x2="230" y2="184" stroke="${Y2}" stroke-width="2" stroke-dasharray="4 4"/><path d="M70 178v12M230 178v12" stroke="${Y2}" stroke-width="2"/>
<rect x="128" y="176" width="44" height="16" rx="8" fill="${INK}" stroke="${Y2}"/><text x="150" y="188" font-size="10" font-family="sans-serif" font-weight="700" fill="${Y2}" text-anchor="middle">24' 6"</text>
`),

  /** A phone scanning a room in 3D. */
  scan: svg(`${grid}
<path d="M70 120 L160 75 L250 120 L160 165Z" fill="${INK}" stroke="${SKY}" stroke-width="2.5"/>
<path d="M70 120 L70 62 L160 18 L160 75Z" fill="#EEF3FF" stroke="${SKY}" stroke-width="2.5"/>
<path d="M160 18 L250 62 L250 120 L160 75Z" fill="#DCE6FF" stroke="${SKY}" stroke-width="2.5"/>
<rect x="190" y="70" width="26" height="22" fill="none" stroke="${Y2}" stroke-width="2" transform="skewY(26)"/>
<path d="M96 76 L96 112 L120 100 L120 64Z" fill="none" stroke="${Y2}" stroke-width="2"/>
<g transform="translate(118 92) rotate(-8)"><rect width="84" height="128" rx="14" fill="${SL}" stroke="${W}" stroke-width="3"/><rect x="8" y="12" width="68" height="100" rx="6" fill="${INK}" opacity=".85"/>
<path d="M18 80 L42 66 L66 80 L42 94Z" fill="none" stroke="${Y}" stroke-width="2"/><path d="M18 80 L18 50 L42 36 L42 66" fill="none" stroke="${Y}" stroke-width="2"/><path d="M42 36 L66 50 L66 80" fill="none" stroke="${Y}" stroke-width="2"/></g>
`),

  /** Clipboard with a checklist and a pencil: no estimates yet. */
  jobs: svg(`${grid}
<rect x="104" y="30" width="112" height="150" rx="12" fill="${INK}" stroke="${SKY}" stroke-width="3"/>
<rect x="132" y="20" width="56" height="22" rx="7" fill="${Y}"/>
${[66, 98, 130].map((y, i) => `<rect x="122" y="${y}" width="18" height="18" rx="4" fill="none" stroke="${i < 2 ? Y : SL2}" stroke-width="3"/>${i < 2 ? `<path d="M126 ${y + 9} l4 4 l8 -9" stroke="${Y}" stroke-width="3" fill="none" stroke-linecap="round"/>` : ''}<rect x="150" y="${y + 5}" width="${i === 1 ? 40 : 52}" height="8" rx="4" fill="${SL2}"/>`).join('')}
<g transform="translate(222 64) rotate(32)"><rect width="16" height="96" rx="3" fill="${Y}"/><path d="M0 96 L8 112 L16 96Z" fill="${Y2}"/><rect width="16" height="12" rx="3" fill="${SKY2}"/></g>
`),

  /** Hard hat and camera: no job sites yet. */
  site: svg(`${grid}
<path d="M88 132 C88 84 118 58 160 58 C202 58 232 84 232 132Z" fill="${Y}"/><rect x="70" y="128" width="180" height="16" rx="8" fill="#E2650C"/>
<rect x="150" y="50" width="20" height="40" rx="8" fill="#E2650C"/>
<g transform="translate(196 118)"><rect width="88" height="62" rx="12" fill="${SL}" stroke="${W}" stroke-width="3"/><rect x="14" y="-10" width="26" height="12" rx="4" fill="${SL2}"/><circle cx="44" cy="31" r="18" fill="${INK}" stroke="${SKY}" stroke-width="4"/><circle cx="44" cy="31" r="7" fill="${SKY}"/></g>
`),

  /** Calendar page with a checked day: nothing scheduled. */
  calendar: svg(`${grid}
<rect x="86" y="34" width="148" height="140" rx="16" fill="${INK}" stroke="${SKY}" stroke-width="3"/><rect x="86" y="34" width="148" height="36" rx="16" fill="${Y}"/><rect x="86" y="56" width="148" height="14" fill="${Y}"/>
<rect x="114" y="24" width="10" height="24" rx="5" fill="${W}"/><rect x="196" y="24" width="10" height="24" rx="5" fill="${W}"/>
${Array.from({ length: 12 }, (_, i) => `<rect x="${102 + (i % 4) * 30}" y="${84 + Math.floor(i / 4) * 28}" width="20" height="18" rx="5" fill="${i === 6 ? SKY : SL2}"/>`).join('')}
<path d="M168 141 l6 6 l12 -14" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>
`),

  /** A signed agreement. */
  sign: svg(`${grid}
<rect x="96" y="24" width="128" height="160" rx="10" fill="#FFFFFF" stroke="#C9D2DF" stroke-width="2"/><rect x="112" y="44" width="70" height="9" rx="4" fill="${SL2}"/>
${[66, 80, 94, 108].map((y) => `<rect x="112" y="${y}" width="${y === 108 ? 60 : 96}" height="6" rx="3" fill="#CBD5E1"/>`).join('')}
<line x1="112" y1="160" x2="208" y2="160" stroke="${SL2}" stroke-width="2"/>
<path d="M114 152 c10 -22 18 -22 16 -4 c-2 14 10 -18 22 -10 c8 6 -6 16 6 12 c10 -4 14 -14 26 -8" stroke="${SKY2}" stroke-width="3.5" fill="none" stroke-linecap="round"/>
<circle cx="236" cy="150" r="22" fill="${Y}"/><path d="M226 150 l7 7 l13 -15" stroke="${INK}" stroke-width="4.5" fill="none" stroke-linecap="round"/>
`),

  /** Invoice with a coin: payments. */
  money: svg(`${grid}
<rect x="80" y="30" width="120" height="150" rx="10" fill="#FFFFFF" stroke="#C9D2DF" stroke-width="2"/><rect x="96" y="48" width="56" height="10" rx="5" fill="${SL2}"/>
${[72, 88, 104, 120].map((y) => `<rect x="96" y="${y}" width="88" height="6" rx="3" fill="#CBD5E1"/>`).join('')}
<rect x="96" y="142" width="88" height="20" rx="6" fill="${SKY}"/>
<circle cx="226" cy="128" r="40" fill="${Y}"/><circle cx="226" cy="128" r="30" fill="none" stroke="#EAB308" stroke-width="4"/>
<text x="226" y="142" font-size="38" font-family="sans-serif" font-weight="800" fill="${INK}" text-anchor="middle">$</text>
`),

  /** Claude: a chat bubble with a sound wave, for the assistant. */
  ai: svg(`${grid}
<rect x="70" y="40" width="150" height="96" rx="22" fill="${INK}" stroke="${SKY}" stroke-width="3"/><path d="M102 136 L94 162 L124 136Z" fill="${INK}" stroke="${SKY}" stroke-width="3" stroke-linejoin="round"/>
${[0, 1, 2, 3, 4, 5, 6].map((i) => `<rect x="${98 + i * 14}" y="${88 - [10, 22, 34, 22, 30, 16, 8][i] / 2}" width="7" height="${[10, 22, 34, 22, 30, 16, 8][i]}" rx="3.5" fill="${i % 2 ? Y : Y2}"/>`).join('')}
<rect x="176" y="96" width="90" height="62" rx="18" fill="${Y}"/><path d="M240 158 L250 178 L224 158Z" fill="${Y}"/>
<circle cx="202" cy="127" r="5" fill="${INK}"/><circle cx="221" cy="127" r="5" fill="${INK}"/><circle cx="240" cy="127" r="5" fill="${INK}"/>`),

  /** Photos fanned out with a check: client photo updates. */
  photos: svg(`${grid}
<g transform="rotate(-10 120 110)"><rect x="70" y="50" width="110" height="90" rx="8" fill="#FFFFFF" stroke="#C9D2DF" stroke-width="2"/><rect x="78" y="58" width="94" height="62" rx="4" fill="${SKY2}"/><path d="M78 120 L110 88 L134 108 L150 94 L172 116 L172 120Z" fill="${SL2}"/></g>
<g transform="rotate(8 200 110)"><rect x="140" y="46" width="110" height="90" rx="8" fill="#FFFFFF" stroke="#C9D2DF" stroke-width="2"/><rect x="148" y="54" width="94" height="62" rx="4" fill="#DCE6FF"/><path d="M160 106 L190 74 L218 106Z" fill="none" stroke="${Y}" stroke-width="5" stroke-linejoin="round"/><rect x="176" y="92" width="28" height="24" fill="${Y}"/></g>
<circle cx="250" cy="150" r="22" fill="#34D399"/><path d="M240 150 l7 7 l13 -15" stroke="${INK}" stroke-width="4.5" fill="none" stroke-linecap="round"/>`),
};

const SPARKS: Record<keyof typeof ART, [number, number, number, string][]> = {
  hero: [[262, 46, 16, Y], [284, 76, 8, Y2], [40, 60, 7, SKY]],
  scan: [[276, 34, 12, Y], [44, 40, 7, SKY]],
  jobs: [[70, 52, 12, Y]],
  site: [[52, 50, 11, SKY], [270, 40, 9, Y]],
  calendar: [[262, 60, 12, Y], [58, 140, 8, SKY]],
  sign: [[70, 50, 11, Y]],
  money: [[60, 56, 10, SKY], [270, 60, 10, Y]],
  ai: [[262, 52, 13, Y], [52, 120, 8, SKY]],
  photos: [[60, 50, 11, Y], [282, 72, 8, SKY]],
};

/** An illustration at a given width (height follows the 320 x 200 shape). */
export function Art({ name, width, beam, still }: { name: keyof typeof ART; width: number; beam?: boolean; still?: boolean }) {
  const height = Math.round((width * 200) / 320);
  const k = width / 320;
  const body = (
    <>
      <SvgXml xml={ART[name]} width={width} height={height} />
      {beam ? <ScanBeam height={height} /> : null}
    </>
  );
  return (
    <View style={{ width, height }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {still ? body : <Float distance={Math.max(3, 6 * k)}>{body}</Float>}
      {SPARKS[name].map(([x, y, r, c], i) => (
        <Twinkle key={i} size={r * 2.2 * k} color={c} delay={i * 450} style={{ left: x * k - r * 1.1 * k, top: y * k - r * 1.1 * k }} />
      ))}
    </View>
  );
}
