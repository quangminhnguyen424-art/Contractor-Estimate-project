import { Children, createContext, isValidElement, useContext, type ReactNode } from 'react';
import {
  Platform, StyleSheet, Text as RNText, TextInput as RNTextInput,
  type TextInputProps, type TextProps, type TextStyle,
} from 'react-native';

import { useT } from '@/i18n';

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

/**
 * Inside this, texts are shown exactly as written. Used around what the client will read (a quote preview, the
 * signing screen): those follow the client's language, not the app's.
 */
const AsWritten = createContext(false);
export function Untranslated({ children }: { children: ReactNode }) {
  return <AsWritten.Provider value>{children}</AsWritten.Provider>;
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

/**
 * Puts a text into the user's language as it is drawn. A whole sentence (words and values, no elements inside)
 * is translated as one; with a <Text> inside it, each run of words is translated by itself.
 * Only the app's own wording changes: names, titles and anything else the user typed stay as they are.
 */
function translated(children: ReactNode, t: (s: string) => string): ReactNode {
  if (typeof children === 'string') return t(children);
  if (!Array.isArray(children)) return children;
  const flat = Children.toArray(children);
  if (flat.every((c) => typeof c === 'string' || typeof c === 'number')) return t(flat.join(''));
  return flat.map((c) => (typeof c === 'string' ? t(c) : isValidElement(c) || typeof c === 'number' ? c : null));
}

export function Text({ style, children, raw, ...props }: TextProps & {
  /** Show exactly this text, never translated (a document preview, an AI answer). Rarely needed. */
  raw?: boolean;
}) {
  const f = useFontStyle(style);
  const t = useT();
  const asWritten = useContext(AsWritten) || raw;
  return (
    <WeightCtx.Provider value={f.weight}>
      <RNText maxFontSizeMultiplier={1.35} {...props} style={f.style}>{asWritten ? children : translated(children, t)}</RNText>
    </WeightCtx.Provider>
  );
}

export function TextInput({ style, placeholder, ...props }: TextInputProps) {
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const t = useT();
  const asWritten = useContext(AsWritten);
  return <RNTextInput maxFontSizeMultiplier={1.35} {...props} placeholder={placeholder && !asWritten ? t(placeholder) : placeholder} style={[flat, { fontFamily: SYSTEM }]} />;
}
