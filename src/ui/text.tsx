import { createContext, useContext } from 'react';
import {
  StyleSheet, Text as RNText, TextInput as RNTextInput,
  type TextInputProps, type TextProps, type TextStyle,
} from 'react-native';

/**
 * Every piece of text in the app uses Be Vietnam Pro: clean, modern, and drawn for Vietnamese accents.
 * Custom fonts come as one file per weight, so the weight in a style is turned into the matching file here.
 */
export const FONT = {
  regular: 'BeVietnamPro_400Regular',
  medium: 'BeVietnamPro_500Medium',
  semibold: 'BeVietnamPro_600SemiBold',
  bold: 'BeVietnamPro_700Bold',
  heavy: 'BeVietnamPro_800ExtraBold',
} as const;

/** Marker for numbers (money, sizes): the app font with equal-width digits so columns line up. */
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
  if (fontFamily && fontFamily !== NUM) return { style, weight }; // a deliberate other font
  return {
    weight,
    style: [rest, { fontFamily: fontFor(weight) }, fontFamily === NUM ? { fontVariant: ['tabular-nums'] as TextStyle['fontVariant'] } : null],
  };
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
