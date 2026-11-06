import { createContext, useContext } from 'react';
import {
  StyleSheet, Text as RNText, TextInput as RNTextInput,
  type TextInputProps, type TextProps, type TextStyle,
} from 'react-native';

/**
 * Everything uses Lexend: a font designed to be easy to read, with full Vietnamese accents.
 * Custom fonts come as one file per weight, so the weight in a style is turned into the matching file here.
 */
export const FONT = {
  regular: 'Lexend_400Regular',
  medium: 'Lexend_500Medium',
  semibold: 'Lexend_600SemiBold',
  bold: 'Lexend_700Bold',
  heavy: 'Lexend_700Bold',
} as const;

/** The font for small labels and numbers (kept as its own name so screens can ask for it). */
export const MONO = 'Lexend_500Medium';
const MONO_BOLD = 'Lexend_600SemiBold';

/** Marker for numbers (money, sizes): the readout font, so digits line up in columns. */
export const NUM = '__numbers__';

type Weight = TextStyle['fontWeight'];

export function fontFor(weight: Weight): string {
  const w = typeof weight === 'number' ? weight : weight === 'bold' ? 700 : weight === 'normal' || !weight ? 400 : parseInt(weight, 10) || 400;
  if (w >= 800) return FONT.heavy;
  if (w >= 700) return FONT.bold;
  if (w >= 600) return FONT.semibold;
  if (w >= 500) return FONT.medium;
  return FONT.regular;
}

// Nested text (a bold word inside a sentence) inherits the weight of the text around it, as in plain React Native.
const WeightCtx = createContext<Weight>(undefined);

function useFontStyle(style: TextProps['style']) {
  const inherited = useContext(WeightCtx);
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const { fontWeight, fontFamily, ...rest } = flat;
  const weight = fontWeight ?? inherited;
  if (fontFamily === NUM || fontFamily === MONO) {
    const w = typeof weight === 'number' ? weight : parseInt(String(weight ?? '400'), 10) || (weight === 'bold' ? 700 : 400);
    return { weight, style: [rest, { fontFamily: w >= 600 ? MONO_BOLD : MONO }] };
  }
  if (fontFamily) return { style, weight }; // a deliberate other font
  return { weight, style: [rest, { fontFamily: fontFor(weight) }] };
}

export function Text({ style, children, ...props }: TextProps) {
  const f = useFontStyle(style);
  return (
    <WeightCtx.Provider value={f.weight}>
      <RNText {...props} style={f.style}>{children}</RNText>
    </WeightCtx.Provider>
  );
}

export function TextInput({ style, ...props }: TextInputProps) {
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const { fontWeight, ...rest } = flat;
  return <RNTextInput {...props} style={[rest, { fontFamily: fontFor(fontWeight) }]} />;
}
