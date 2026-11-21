import React from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { HeaderHeightContext } from 'expo-router/react-navigation';
import {
  Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View,
  type ScrollViewInstance, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Art, type ART } from './art';
import { PressScale, Reveal } from './motion';
import { Sheet } from './Sheet';
import { NUM, Text, TextInput } from './text';
import { C } from './theme';

export { C, P } from './theme';

export const mono = NUM;

/**
 * Keeps whatever is at the bottom (a chat box, a footer button) above the keyboard.
 * The keyboard view needs to know how far this view starts from the top of the glass. Under a normal header that
 * is the header's height; in a pop-up sheet or a screen with no header (setup, first-run terms) it is more, so the
 * real position is measured: once when laid out and again after the screen has finished sliding in.
 */
export function KeyboardSafe({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const header = React.useContext(HeaderHeightContext) ?? 0;
  const ref = React.useRef<React.ComponentRef<typeof View>>(null);
  const [top, setTop] = React.useState(0);
  const measure = React.useCallback(() => {
    ref.current?.measureInWindow((_x: number, y: number) => { if (Number.isFinite(y) && y >= 0 && y < 400) setTop(Math.round(y)); });
  }, []);
  React.useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const timers = [setTimeout(measure, 450), setTimeout(measure, 1000)];
    return () => timers.forEach(clearTimeout);
  }, [measure]);
  return (
    <View ref={ref} collapsable={false} onLayout={Platform.OS === 'ios' ? measure : undefined} style={{ flex: 1 }}>
      <KeyboardAvoidingView style={[{ flex: 1 }, style]} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Math.max(header, top)}>
        {children}
      </KeyboardAvoidingView>
    </View>
  );
}

export function Screen({ children, scroll = true, padded = true, footer, scrollEnabled = true }: {
  children: React.ReactNode; scroll?: boolean; padded?: boolean; footer?: React.ReactNode; scrollEnabled?: boolean;
}) {
  const insets = useSafeAreaInsets();
  // On a computer screen, keep content at a comfortable reading width.
  const pad = padded ? { padding: 20, paddingTop: 12, gap: 16, width: '100%' as const, maxWidth: 760, alignSelf: 'center' as const } : null;
  return (
    <KeyboardSafe style={{ backgroundColor: C.bg }}>
      {scroll ? (
        <ScrollView contentContainerStyle={[pad, { paddingBottom: 32 }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
          scrollEnabled={scrollEnabled}>
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, pad]}>{children}</View>
      )}
      {footer ? (
        <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: Math.max(16, insets.bottom), backgroundColor: C.bg }}>
          <View style={{ width: '100%', maxWidth: 728, alignSelf: 'center', gap: 10 }}>{footer}</View>
        </View>
      ) : null}
    </KeyboardSafe>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function H1({ children }: { children: React.ReactNode }) {
  return <Text style={s.h1}>{children}</Text>;
}
export function H2({ children, style, raw }: { children: React.ReactNode; style?: StyleProp<TextStyle>; /** Shown as written, never translated: a name or title the user typed. */ raw?: boolean }) {
  return <Text raw={raw} style={[s.h2, style]}>{children}</Text>;
}
export function Label({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.label, style]}>{children}</Text>;
}
export function Muted({ children, style, raw }: { children: React.ReactNode; style?: StyleProp<TextStyle>; raw?: boolean }) {
  return <Text raw={raw} style={[s.muted, style]}>{children}</Text>;
}

export function Button({ title, onPress, kind = 'primary', disabled, style, accessibilityLabel, icon }: {
  title: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'ghost' | 'danger'; disabled?: boolean;
  style?: StyleProp<ViewStyle>; accessibilityLabel?: string; icon?: IconName;
}) {
  const bg = kind === 'primary' ? C.accent : kind === 'secondary' ? C.cardHi : 'transparent';
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
        kind === 'ghost' || kind === 'danger' ? { height: 44 } : null,
        style,
      ]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {icon ? <Ionicons name={icon} size={19} color={fg} /> : null}
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
          style={[s.input, props.multiline && { minHeight: 120, textAlignVertical: 'top', paddingTop: 12, paddingBottom: 12 }]}
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
export function NumberField({ label, value, onChange, suffix, help, style, decimals = true, max }: {
  label: string; value: number; onChange: (n: number) => void; suffix?: string; help?: string;
  style?: StyleProp<ViewStyle>; decimals?: boolean;
  /** The most this can sensibly be (a 25% tax rate, a 100% share): a slipped digit stops here instead of being saved. */
  max?: number;
}) {
  // Money with cents shows as money (1691.80, not 1691.8).
  const show = (v: number) => (!Number.isFinite(v) ? '' : Number.isInteger(v) || Math.abs(v * 100 - Math.round(v * 100)) > 1e-6 ? String(v) : v.toFixed(2));
  const [text, setText] = React.useState(show(value));
  const [lastValue, setLastValue] = React.useState(value);
  // When the value changes from outside (not from typing here), show the new value.
  if (value !== lastValue && !(Number.isNaN(value) && Number.isNaN(lastValue))) {
    setLastValue(value);
    // An emptied box means 0: leave it empty so the next digit typed is not "05".
    if ((text === '' ? 0 : parseFloat(text)) !== value) setText(show(value));
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
        // Phones set to a comma decimal (Vietnam, Spain, Latin America) type "12,5": that is 12.5, not 125.
        const dotted = decimals && !t.includes('.') && (t.match(/,/g) ?? []).length === 1 ? t.replace(',', '.') : t;
        const [whole, ...rest] = dotted.replace(/[^0-9.]/g, '').split('.');
        const clean = rest.length ? `${whole}.${rest.join('')}` : whole;
        const n = parseFloat(clean);
        const over = max != null && Number.isFinite(n) && n > max;
        setText(over ? show(max) : clean);
        onChange(over ? max : Number.isFinite(n) ? n : 0);
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
      style={[s.chip, selected && { backgroundColor: C.ink }]}>
      <Text style={[s.chipText, selected && { color: '#FFFFFF', fontWeight: '600' }]}>{label}</Text>
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
            <Text style={[s.segText, on && { color: C.ink, fontWeight: '600' }]}>{o.label}</Text>
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
    <View style={{ backgroundColor: bg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, gap: 2 }}>
      <Text style={{ color: fg, fontWeight: '600', fontSize: 15 }}>{title}</Text>
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
  const current = options.find((o) => o.value === value);
  const listRef = React.useRef<ScrollViewInstance>(null);
  const at = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <View style={{ gap: 6 }}>
      {label ? <Label>{label}</Label> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${current?.label ?? placeholder}`} onPress={() => { Keyboard.dismiss(); setOpen(true); }}
        style={[s.inputWrap, { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, minHeight: 52 }, error ? { borderColor: C.danger, borderWidth: 1.5 } : null]}>
        <Text style={{ flex: 1, fontSize: 17, color: current ? C.ink : C.muted }} numberOfLines={1}>{current?.label ?? placeholder}</Text>
        <Ionicons name="chevron-down" size={20} color={C.ink2} />
      </Pressable>
      {error ? <Text style={{ color: C.danger, fontSize: 13 }}>{error}</Text> : help ? <Muted style={{ fontSize: 13 }}>{help}</Muted> : null}
      <Sheet visible={open} onClose={() => setOpen(false)} title={label || placeholder} scroll listRef={listRef}
        onShow={() => { setTimeout(() => listRef.current?.scrollTo({ y: Math.max(0, at * 57 - 120), animated: false }), 0); }}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable key={String(o.value)} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => { onChange(o.value); setOpen(false); }}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 51, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12,
                backgroundColor: on ? C.accentTint : pressed ? C.cardHi : C.panel })}>
              <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? C.accent : C.muted} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.ink, fontSize: 16, fontWeight: on ? '600' : '400' }}>{o.label}</Text>
                {o.sub ? <Text style={{ color: C.muted, fontSize: 13 }}>{o.sub}</Text> : null}
              </View>
            </Pressable>
          );
        })}
      </Sheet>
    </View>
  );
}

/** A pale group of rows separated by hairlines (like a phone settings list). */
export function List({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[{ backgroundColor: C.panel, borderRadius: 16, overflow: 'hidden' }, style]}>
      {items.map((c, i) => (
        <View key={i}>
          {i ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.line, marginLeft: 16 }} /> : null}
          {c}
        </View>
      ))}
    </View>
  );
}

/** One tappable row in a List: icon, title, a short line under it, and an arrow (or a value on the right). */
export function ListRow({ icon, title, sub, right, onPress, tone, danger }: {
  icon?: IconName; title: string; sub?: string; right?: string; onPress: () => void; tone?: string; danger?: boolean;
}) {
  const color = danger ? C.danger : tone ?? C.ink2;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 52, backgroundColor: pressed ? C.cardHi : 'transparent' })}>
      {icon ? <Ionicons name={icon} size={20} color={color} style={{ width: 22, textAlign: 'center' }} /> : null}
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ color: danger ? C.danger : C.ink, fontSize: 16 }} numberOfLines={1}>{title}</Text>
        {sub ? <Text style={{ color: C.muted, fontSize: 13 }} numberOfLines={2}>{sub}</Text> : null}
      </View>
      {right ? <Text style={{ color: C.muted, fontSize: 15, flexShrink: 1, maxWidth: '50%' }} numberOfLines={1}>{right}</Text> : null}
      {danger ? null : <Ionicons name="chevron-forward" size={16} color="#A3ACB9" />}
    </Pressable>
  );
}

/** A friendly picture with a short message and one action, for screens with nothing in them yet. */
export function Empty({ art, title, text, action, onAction, width = 180 }: {
  art: keyof typeof ART; title: string; text?: string; action?: string; onAction?: () => void; width?: number;
}) {
  return (
    <Reveal style={{ alignItems: 'center', gap: 10, paddingVertical: 12 }}>
      <Art name={art} width={width} />
      <Text style={{ color: C.ink, fontSize: 18, fontWeight: '600', textAlign: 'center' }}>{title}</Text>
      {text ? <Text style={{ color: C.muted, fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 340 }}>{text}</Text> : null}
      {action && onAction ? <Button title={action} onPress={onAction} style={{ alignSelf: 'stretch', marginTop: 4 }} /> : null}
    </Reveal>
  );
}

/** Section title with an optional link on the right ("See all"). */
export function Section({ title, link, onLink }: { title: string; link?: string; onLink?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: -6, paddingHorizontal: 4 }}>
      <Text style={{ color: C.muted, fontSize: 14, fontWeight: '600' }}>{title}</Text>
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
    <View style={{ flex: 1, minWidth: 96, backgroundColor: C.panel, borderRadius: 14, padding: 12, gap: 2 }}>
      <Text style={{ color: C.muted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color, fontSize: 17, fontWeight: '700', fontFamily: mono }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

export const s = StyleSheet.create({
  card: { backgroundColor: C.panel, borderRadius: 16, padding: 16, gap: 10 },
  h1: { fontSize: 26, fontWeight: '700', color: C.ink, letterSpacing: -0.4 },
  h2: { fontSize: 17, fontWeight: '600', color: C.ink },
  label: { fontSize: 14, fontWeight: '500', color: C.ink2 },
  muted: { fontSize: 14, color: C.muted, lineHeight: 20 },
  btn: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  btnText: { fontSize: 16, fontWeight: '600' },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingRight: 12 },
  // minWidth 0 lets the box shrink in a narrow field (two side by side), so the unit after it stays inside the border.
  input: { flex: 1, minWidth: 0, minHeight: 48, paddingHorizontal: 14, fontSize: 16, color: C.ink, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null) },
  suffix: { color: C.muted, fontSize: 14, flexShrink: 0 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: C.cardHi, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 15, color: C.ink },
  seg: { flexDirection: 'row', backgroundColor: C.cardHi, borderRadius: 12, padding: 3, gap: 3 },
  segItem: { flex: 1, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: C.card, shadowColor: '#0B1324', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segText: { fontSize: 14, color: C.muted, fontWeight: '500' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  rowText: { fontSize: 15, color: C.ink },
  stepBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.cardHi, alignItems: 'center', justifyContent: 'center' },
  stepTxt: { fontSize: 22, color: C.ink },
});
