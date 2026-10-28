import React from 'react';
import {
  Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const C = {
  bg: '#F4F3EF',
  card: '#FFFFFF',
  ink: '#1B1E22',
  ink2: '#3F444A',
  muted: '#5B6168',
  line: '#E2E0DA',
  lineSoft: '#EFEDE8',
  accent: '#C2410C',
  accentDark: '#9A3412',
  accentTint: '#FBEDE5',
  warnBg: '#FFF4D6',
  warnInk: '#5C3900',
  infoBg: '#E7F0FA',
  infoInk: '#1E4E8C',
  okBg: '#E3F2E7',
  okInk: '#1D6B3A',
  dark: '#1B1E22',
  darkMuted: '#C9CCD1',
};

export const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, Menlo, monospace' });

export function Screen({ children, scroll = true, padded = true, footer }: {
  children: React.ReactNode; scroll?: boolean; padded?: boolean; footer?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const pad = padded ? { padding: 16, gap: 14 } : null;
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {scroll ? (
        <ScrollView contentContainerStyle={[pad, { paddingBottom: 32 }]} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, pad]}>{children}</View>
      )}
      {footer ? (
        <View style={{ padding: 16, paddingBottom: Math.max(16, insets.bottom), borderTopWidth: 1, borderColor: C.line, backgroundColor: C.bg, gap: 10 }}>
          {footer}
        </View>
      ) : null}
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function H1({ children }: { children: React.ReactNode }) {
  return <Text style={s.h1}>{children}</Text>;
}
export function H2({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.h2, style]}>{children}</Text>;
}
export function Label({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.label, style]}>{children}</Text>;
}
export function Muted({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.muted, style]}>{children}</Text>;
}

export function Button({ title, onPress, kind = 'primary', disabled, style, accessibilityLabel }: {
  title: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'ghost' | 'danger'; disabled?: boolean;
  style?: StyleProp<ViewStyle>; accessibilityLabel?: string;
}) {
  const bg = kind === 'primary' ? C.accent : kind === 'secondary' ? C.card : 'transparent';
  const fg = kind === 'primary' ? '#FFFFFF' : kind === 'danger' ? '#B42318' : kind === 'ghost' ? C.accent : C.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.btn,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
        kind === 'secondary' && { borderWidth: 1, borderColor: '#C9C6BE' },
        kind === 'ghost' || kind === 'danger' ? { height: 44 } : null,
        style,
      ]}>
      <Text style={[s.btnText, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, help, suffix, style, ...props }: TextInputProps & { label: string; help?: string; suffix?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ gap: 6 }, style]}>
      <Label>{label}</Label>
      <View style={s.inputWrap}>
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor="#8A8F96"
          style={[s.input, props.multiline && { height: 120, textAlignVertical: 'top', paddingTop: 12 }]}
          {...props}
        />
        {suffix ? <Text style={s.suffix}>{suffix}</Text> : null}
      </View>
      {help ? <Muted style={{ fontSize: 13 }}>{help}</Muted> : null}
    </View>
  );
}

/** Numeric input that keeps a local text value so typing "1." or clearing works. */
export function NumberField({ label, value, onChange, suffix, help, style, decimals = true }: {
  label: string; value: number; onChange: (n: number) => void; suffix?: string; help?: string;
  style?: StyleProp<ViewStyle>; decimals?: boolean;
}) {
  const [text, setText] = React.useState(Number.isFinite(value) ? String(value) : '');
  const [lastValue, setLastValue] = React.useState(value);
  // When the value changes from outside (not from typing here), show the new value.
  if (value !== lastValue && !(Number.isNaN(value) && Number.isNaN(lastValue))) {
    setLastValue(value);
    if (parseFloat(text) !== value) setText(Number.isFinite(value) ? String(value) : '');
  }
  return (
    <Field
      label={label}
      help={help}
      suffix={suffix}
      style={style}
      value={text}
      keyboardType={decimals ? 'decimal-pad' : 'number-pad'}
      inputMode={decimals ? 'decimal' : 'numeric'}
      onChangeText={(t) => {
        const clean = t.replace(/[^0-9.]/g, '');
        setText(clean);
        const n = parseFloat(clean);
        onChange(Number.isFinite(n) ? n : 0);
      }}
    />
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={[s.chip, selected && { borderColor: C.accent, borderWidth: 2, backgroundColor: C.accentTint }]}>
      <Text style={[s.chipText, selected && { color: C.accentDark, fontWeight: '700' }]}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string; disabled?: boolean }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <View style={s.seg}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on, disabled: !!o.disabled }}
            disabled={o.disabled}
            onPress={() => onChange(o.value)}
            style={[s.segItem, on && s.segOn, o.disabled && { opacity: 0.4 }]}>
            <Text style={[s.segText, on && { color: C.ink, fontWeight: '700' }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'info' | 'ok' | 'warn' | 'bad' }) {
  const map = {
    neutral: ['#EDECE7', C.ink2], info: [C.infoBg, C.infoInk], ok: [C.okBg, C.okInk],
    warn: [C.warnBg, C.warnInk], bad: ['#FDE8E7', '#912018'],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

export function Banner({ tone, title, children }: { tone: 'warn' | 'info' | 'ok'; title: string; children?: React.ReactNode }) {
  const bg = tone === 'warn' ? C.warnBg : tone === 'info' ? C.infoBg : C.okBg;
  const fg = tone === 'warn' ? C.warnInk : tone === 'info' ? C.infoInk : C.okInk;
  return (
    <View style={{ backgroundColor: bg, borderRadius: 14, padding: 14, gap: 4 }}>
      <Text style={{ color: fg, fontWeight: '700', fontSize: 15 }}>{title}</Text>
      {children ? <Text style={{ color: fg, fontSize: 14, lineHeight: 20 }}>{children}</Text> : null}
    </View>
  );
}

export function Row({ left, right, bold, onPress, sub }: {
  left: string; right?: string; bold?: boolean; onPress?: () => void; sub?: string;
}) {
  const inner = (
    <View style={s.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[s.rowText, bold && { fontWeight: '700' }]}>{left}</Text>
        {sub ? <Text style={{ color: C.muted, fontSize: 13 }}>{sub}</Text> : null}
      </View>
      {right ? <Text style={[s.rowText, { fontFamily: mono }, bold && { fontWeight: '700' }]}>{right}</Text> : null}
    </View>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {inner}
    </Pressable>
  ) : inner;
}

export function Stepper({ label, value, onChange, min = 0 }: { label: string; value: number; onChange: (n: number) => void; min?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Text style={{ flex: 1, fontSize: 15, color: C.ink }}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Decrease ${label}`} onPress={() => onChange(Math.max(min, value - 1))} style={s.stepBtn}>
        <Text style={s.stepTxt}>−</Text>
      </Pressable>
      <Text style={{ minWidth: 32, textAlign: 'center', fontFamily: mono, fontSize: 16 }}>{value}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Increase ${label}`} onPress={() => onChange(value + 1)} style={s.stepBtn}>
        <Text style={s.stepTxt}>+</Text>
      </Pressable>
    </View>
  );
}

export const s = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 16, gap: 10 },
  h1: { fontSize: 26, fontWeight: '700', color: C.ink },
  h2: { fontSize: 17, fontWeight: '700', color: C.ink },
  label: { fontSize: 14, fontWeight: '600', color: C.ink2 },
  muted: { fontSize: 14, color: C.muted, lineHeight: 20 },
  btn: { height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  btnText: { fontSize: 17, fontWeight: '600' },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingRight: 12 },
  input: { flex: 1, minHeight: 48, paddingHorizontal: 14, fontSize: 16, color: C.ink },
  suffix: { color: C.muted, fontSize: 14 },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 15, color: C.ink, fontWeight: '500' },
  seg: { flexDirection: 'row', backgroundColor: '#E9E7E1', borderRadius: 12, padding: 4, gap: 4 },
  segItem: { flex: 1, height: 40, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: C.card, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segText: { fontSize: 14, color: C.ink2, fontWeight: '500' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderColor: C.lineSoft },
  rowText: { fontSize: 15, color: C.ink },
  stepBtn: { width: 44, height: 44, borderRadius: 10, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  stepTxt: { fontSize: 22, color: C.ink },
});
