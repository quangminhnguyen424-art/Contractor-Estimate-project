import { createContext, useContext } from 'react';
import {
  Platform, StyleSheet, Text as RNText, TextInput as RNTextInput,
  type TextInputProps, type TextProps, type TextStyle,
} from 'react-native';

/**
 * Everything uses the phone's own font: San Francisco on iPhone (the font of Facebook, Messages and most iPhone apps),
 * Roboto on Android, and the same system fonts on the web. It has every weight and full Vietnamese accents built in.
 */
const SYSTEM = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  default: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
}) as string;

export const FONT = {
  regular: SYSTEM,
  medium: SYSTEM,
  semibold: SYSTEM,
  bold: SYSTEM,
  heavy: SYSTEM,
} as const;

/** Small labels and numbers use the same font with even-width digits, so money lines up in columns. */
export const MONO = '__mono__';

/** Marker for numbers (money, sizes). */
export const NUM = '__numbers__';

type Weight = TextStyle['fontWeight'];

/** Kept for screens that ask for a font by weight: the system font has every weight. */
export function fontFor(_weight: Weight): string {
  return SYSTEM;
}

// Nested text (a bold word inside a sentence) inherits the weight of the text around it, as in plain React Native.
const WeightCtx = createContext<Weight>(undefined);

function useFontStyle(style: TextProps['style']) {
  const inherited = useContext(WeightCtx);
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const { fontFamily, ...rest } = flat;
  const weight = flat.fontWeight ?? inherited;
  if (fontFamily === NUM || fontFamily === MONO) {
    return { weight, style: [rest, { fontFamily: SYSTEM, fontWeight: weight, fontVariant: ['tabular-nums'] as TextStyle['fontVariant'] }] };
  }
  if (fontFamily && fontFamily !== SYSTEM) return { style, weight }; // a deliberate other font
  return { weight, style: [rest, { fontFamily: SYSTEM, fontWeight: weight }] };
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
  return <RNTextInput {...props} style={[flat, { fontFamily: SYSTEM }]} />;
}
