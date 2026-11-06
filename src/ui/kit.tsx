import React from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Modal, Pressable, ScrollView, StyleSheet, View,
  type ScrollViewInstance, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Art, type ART } from './art';
import { PressScale, Reveal } from './motion';
import { NUM, Text, TextInput } from './text';

/**
 * Colors: the "job-site HUD" look. Near-black surfaces so job photos and numbers stand out, safety orange for
 * the thing to tap, sky blue for measurements and scans.
 */
export const C = {
  // Clear Field: a light, easy-to-read look for phones used outside on job sites.
  bg: '#F5F7FB',
  card: '#FFFFFF',
  cardHi: '#EEF2F8',
  ink: '#0B1324',
  ink2: '#3B4659',
  muted: '#4F5A6B',
  line: '#DCE3EC',
  lineSoft: '#EEF2F8',
  accent: '#2457F5', // the main action color (blue)
  accentDark: '#1A3FC0', // accent used as text on a tinted background
  accentTint: 'rgba(36,87,245,0.10)',
  onAccent: '#FFFFFF', // text and icons on the blue
  orange: '#FF6B1A', // highlights: the quick-add button, "now" markers
  orangeInk: '#B4480C', // orange as text on white (readable)
  sky: '#0369A1',
  skyTint: 'rgba(3,105,161,0.10)',
  warnBg: '#FFF4EC',
  warnInk: '#9A3412',
  infoBg: '#EEF3FF',
  infoInk: '#1A3FC0',
  okBg: '#E6F6EF',
  okInk: '#08734F',
  badBg: '#FDECEC',
  danger: '#C2271B',
  dark: '#EEF3FF', // the highlighted "client price" panel
  darkMuted: '#4F5A6B',
};

/** Paper colors for previews of documents the client sees (quotes, invoices): always white paper. */
export const P = { paper: '#FFFFFF', ink: '#1B1E22', ink2: '#3F444A', muted: '#5B6168', line: '#E2E0DA', accent: '#B45309' };

export const mono = NUM;

export function Screen({ children, scroll = true, padded = true, footer, scrollEnabled = true }: {
  children: React.ReactNode; scroll?: boolean; padded?: boolean; footer?: React.ReactNode; scrollEnabled?: boolean;
}) {
  const insets = useSafeAreaInsets();
  // On a computer screen, keep content at a comfortable reading width.
  const pad = padded ? { padding: 16, gap: 14, width: '100%' as const, maxWidth: 760, alignSelf: 'center' as const } : null;
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {scroll ? (
        <ScrollView contentContainerStyle={[pad, { paddingBottom: 32 }]} keyboardShouldPersistTaps="handled" scrollEnabled={scrollEnabled}>
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, pad]}>{children}</View>
      )}
      {footer ? (
        <View style={{ padding: 16, paddingBottom: Math.max(16, insets.bottom), borderTopWidth: 1, borderColor: C.line, backgroundColor: C.bg }}>
          <View style={{ width: '100%', maxWidth: 728, alignSelf: 'center', gap: 10 }}>{footer}</View>
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

export function Button({ title, onPress, kind = 'primary', disabled, style, accessibilityLabel, icon }: {
  title: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'ghost' | 'danger'; disabled?: boolean;
  style?: StyleProp<ViewStyle>; accessibilityLabel?: string; icon?: IconName;
}) {
  const bg = kind === 'primary' ? C.accent : kind === 'secondary' ? C.card : 'transparent';
  const fg = kind === 'primary' ? C.onAccent : kind === 'danger' ? C.danger : kind === 'ghost' ? C.accent : C.ink;
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        s.btn,
        { backgroundColor: bg, opacity: disabled ? 0.4 : 1 },
        kind === 'secondary' && { borderWidth: 1, borderColor: C.line },
        kind === 'primary' && !disabled && { shadowColor: C.accent, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
        kind === 'ghost' || kind === 'danger' ? { height: 44 } : null,
        style,
      ]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {icon ? <Ionicons name={icon} size={20} color={fg} /> : null}
        <Text style={[s.btnText, { color: fg }]}>{title}</Text>
      </View>
    </PressScale>
  );
}

export function Field({ label, help, suffix, style, error, ...props }: TextInputProps & { label: string; help?: string; suffix?: string; style?: StyleProp<ViewStyle>; error?: string | null }) {
  return (
    <View style={[{ gap: 6 }, style]}>
      <Label>{label}</Label>
      <View style={[s.inputWrap, error ? { borderColor: C.danger, borderWidth: 1.5 } : null]}>
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor="#64748B"
          style={[s.input, props.multiline && { height: 120, textAlignVertical: 'top', paddingTop: 12 }]}
          {...props}
        />
        {suffix ? <Text style={s.suffix}>{suffix}</Text> : null}
      </View>
      {error ? (
        <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="alert-circle-outline" size={16} color={C.danger} />
          <Text style={{ color: C.danger, fontSize: 13 }}>{error}</Text>
        </View>
      ) : help ? <Muted style={{ fontSize: 13 }}>{help}</Muted> : null}
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
    neutral: [C.cardHi, C.ink2], info: [C.infoBg, C.infoInk], ok: [C.okBg, C.okInk],
    warn: [C.warnBg, C.warnInk], bad: [C.badBg, C.danger],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
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
      <Text style={{ minWidth: 32, textAlign: 'center', fontFamily: mono, fontSize: 16, color: C.ink }}>{value}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Increase ${label}`} onPress={() => onChange(value + 1)} style={s.stepBtn}>
        <Text style={s.stepTxt}>+</Text>
      </Pressable>
    </View>
  );
}

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

/**
 * A drop-down choice (like a menu in Word): shows the current choice; tap it and a list slides up that scrolls,
 * with the current choice marked. Tap a line to pick it.
 */
export function Select<T extends string | number>({ label, value, options, onChange, placeholder = 'Choose…', help, error }: {
  label: string; value: T | null | undefined; options: { value: T; label: string; sub?: string }[]; onChange: (v: T) => void;
  placeholder?: string; help?: string; error?: string | null;
}) {
  const [open, setOpen] = React.useState(false);
  const insets = useSafeAreaInsets();
  const current = options.find((o) => o.value === value);
  const listRef = React.useRef<ScrollViewInstance>(null);
  const at = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <View style={{ gap: 6 }}>
      {label ? <Label>{label}</Label> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${current?.label ?? placeholder}`} onPress={() => setOpen(true)}
        style={[s.inputWrap, { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, minHeight: 52 }, error ? { borderColor: C.danger, borderWidth: 1.5 } : null]}>
        <Text style={{ flex: 1, fontSize: 17, color: current ? C.ink : C.muted }} numberOfLines={1}>{current?.label ?? placeholder}</Text>
        <Ionicons name="chevron-down" size={20} color={C.ink2} />
      </Pressable>
      {error ? <Text style={{ color: C.danger, fontSize: 13 }}>{error}</Text> : help ? <Muted style={{ fontSize: 13 }}>{help}</Muted> : null}
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}
        onShow={() => { setTimeout(() => listRef.current?.scrollTo({ y: Math.max(0, at * 57 - 120), animated: false }), 0); }}>
        <Pressable accessibilityLabel="Close" onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(11,19,36,0.45)', justifyContent: 'flex-end' }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: C.card, borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: '75%', paddingBottom: insets.bottom + 8, width: '100%', maxWidth: 640, alignSelf: 'center' }}>
            <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: C.line, marginTop: 10 }} />
            <Text style={{ color: C.ink, fontSize: 18, fontWeight: '700', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8 }}>{label || placeholder}</Text>
            <ScrollView ref={listRef} contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 12, gap: 6 }}>
              {options.map((o) => {
                const on = o.value === value;
                return (
                  <Pressable key={String(o.value)} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => { onChange(o.value); setOpen(false); }}
                    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 51, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14,
                      borderWidth: 1, borderColor: on ? C.accent : C.line, backgroundColor: on ? C.accentTint : pressed ? C.cardHi : C.card })}>
                    <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? C.accent : C.muted} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.ink, fontSize: 16, fontWeight: on ? '600' : '400' }}>{o.label}</Text>
                      {o.sub ? <Text style={{ color: C.muted, fontSize: 13 }}>{o.sub}</Text> : null}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/** A white card holding rows separated by thin lines (like a phone settings list). */
export function List({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[{ backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.line, overflow: 'hidden' }, style]}>
      {items.map((c, i) => <View key={i} style={i ? { borderTopWidth: 1, borderColor: C.lineSoft } : null}>{c}</View>)}
    </View>
  );
}

/** One tappable row in a List: icon, title, a short line under it, and an arrow (or a value on the right). */
export function ListRow({ icon, title, sub, right, onPress, tone, danger }: {
  icon?: IconName; title: string; sub?: string; right?: string; onPress: () => void; tone?: string; danger?: boolean;
}) {
  const color = danger ? C.danger : tone ?? C.accent;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 56, backgroundColor: pressed ? C.cardHi : 'transparent' })}>
      {icon ? (
        <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: danger ? C.badBg : `${color}1A`, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={18} color={color} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ color: danger ? C.danger : C.ink, fontSize: 16, fontWeight: '500' }} numberOfLines={1}>{title}</Text>
        {sub ? <Text style={{ color: C.muted, fontSize: 13 }} numberOfLines={2}>{sub}</Text> : null}
      </View>
      {right ? <Text style={{ color: C.ink2, fontSize: 14, fontWeight: '600' }}>{right}</Text> : null}
      {danger ? null : <Ionicons name="chevron-forward" size={16} color={C.muted} />}
    </Pressable>
  );
}

/** A round action with a label under it (a row of 3–4 of these sits under a page title). */
export function Action({ icon, label, onPress, badge }: { icon: IconName; label: string; onPress: () => void; badge?: boolean }) {
  return (
    <PressScale accessibilityRole="button" accessibilityLabel={label} onPress={onPress} scaleTo={0.92} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: C.accentTint, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={23} color={C.accent} />
        {badge ? <View style={{ position: 'absolute', top: 2, right: 2, width: 12, height: 12, borderRadius: 6, backgroundColor: C.orange, borderWidth: 2, borderColor: C.bg }} /> : null}
      </View>
      <Text style={{ color: C.ink2, fontSize: 12, fontWeight: '600', textAlign: 'center' }} numberOfLines={2}>{label}</Text>
    </PressScale>
  );
}

/** A big square shortcut with an icon (home screen). */
export function Tile({ icon, title, sub, onPress, tone = 'yellow', index = 0 }: {
  icon: IconName; title: string; sub?: string; onPress: () => void; tone?: 'yellow' | 'sky' | 'slate'; index?: number;
}) {
  const fg = tone === 'yellow' ? C.accent : tone === 'sky' ? C.sky : C.ink2;
  const tint = tone === 'yellow' ? C.accentTint : tone === 'sky' ? C.skyTint : C.cardHi;
  return (
    <Reveal index={index} style={{ flexBasis: '47%', flexGrow: 1 }}>
      <PressScale accessibilityRole="button" accessibilityLabel={title} onPress={onPress}
        style={{ backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.line, padding: 14, gap: 10, minHeight: 112 }}>
        <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: tint, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={22} color={fg} />
        </View>
        <View style={{ gap: 2 }}>
          <Text style={{ color: C.ink, fontWeight: '700', fontSize: 15 }}>{title}</Text>
          {sub ? <Text style={{ color: C.muted, fontSize: 12 }} numberOfLines={2}>{sub}</Text> : null}
        </View>
      </PressScale>
    </Reveal>
  );
}

/** A friendly picture with a short message and one action, for screens with nothing in them yet. */
export function Empty({ art, title, text, action, onAction, width = 260 }: {
  art: keyof typeof ART; title: string; text?: string; action?: string; onAction?: () => void; width?: number;
}) {
  return (
    <Reveal style={{ alignItems: 'center', gap: 10, paddingVertical: 12 }}>
      <Art name={art} width={width} />
      <Text style={{ color: C.ink, fontSize: 19, fontWeight: '700', textAlign: 'center' }}>{title}</Text>
      {text ? <Text style={{ color: C.muted, fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 340 }}>{text}</Text> : null}
      {action && onAction ? <Button title={action} onPress={onAction} style={{ alignSelf: 'stretch', marginTop: 4 }} /> : null}
    </Reveal>
  );
}

/** Section title with an optional link on the right ("See all"). */
export function Section({ title, link, onLink }: { title: string; link?: string; onLink?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
      <Text style={{ color: C.ink, fontSize: 17, fontWeight: '700' }}>{title}</Text>
      {link && onLink ? (
        <Pressable accessibilityRole="button" onPress={onLink} hitSlop={8}>
          <Text style={{ color: C.accent, fontWeight: '600', fontSize: 14 }}>{link}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** A labelled number in a small box (money, counts). */
export function Stat({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' | 'accent' }) {
  const color = tone === 'ok' ? C.okInk : tone === 'warn' ? C.warnInk : tone === 'accent' ? C.accent : C.ink;
  return (
    <View style={{ flex: 1, minWidth: 96, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 12, gap: 2 }}>
      <Text style={{ color: C.muted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color, fontSize: 17, fontWeight: '700', fontFamily: mono }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

export const s = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.line, padding: 16, gap: 10, shadowColor: '#0B1324', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  h1: { fontSize: 28, fontWeight: '800', color: C.ink, letterSpacing: -0.4 },
  h2: { fontSize: 17, fontWeight: '700', color: C.ink },
  label: { fontSize: 14, fontWeight: '600', color: C.ink2 },
  muted: { fontSize: 14, color: C.muted, lineHeight: 21 },
  btn: { height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  btnText: { fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingRight: 12 },
  input: { flex: 1, minHeight: 48, paddingHorizontal: 14, fontSize: 16, color: C.ink },
  suffix: { color: C.muted, fontSize: 14 },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 15, color: C.ink, fontWeight: '500' },
  seg: { flexDirection: 'row', backgroundColor: '#E7ECF4', borderRadius: 14, padding: 4, gap: 4 },
  segItem: { flex: 1, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: C.card, shadowColor: '#0B1324', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  segText: { fontSize: 14, color: C.ink2, fontWeight: '500' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderColor: C.lineSoft },
  rowText: { fontSize: 15, color: C.ink },
  stepBtn: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.cardHi, alignItems: 'center', justifyContent: 'center' },
  stepTxt: { fontSize: 22, color: C.ink },
});
