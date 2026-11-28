import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import type { JobStage } from '@/engine/job';

import { NUM, Text } from '../text';
import { C } from '../theme';
import { clickable, hoverStyle } from '../wide';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** A white box on the pale canvas, with a title line and an optional link at its right ("All jobs"). */
export function Panel({ title, link, onLink, children, style, flush, fill }: {
  title?: string; link?: string; onLink?: () => void; children: React.ReactNode; style?: StyleProp<ViewStyle>;
  /** The content runs to the box's edges (a table); otherwise it is padded. */
  flush?: boolean;
  /** The content takes the box's whole height (a calendar that fills the window). */
  fill?: boolean;
}) {
  return (
    <View style={[{ backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, overflow: 'hidden' }, style]}>
      {title ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 }}>
          <Text style={{ color: C.ink, fontSize: 16, fontWeight: '700' }}>{title}</Text>
          {link && onLink ? (
            <Pressable accessibilityRole="link" onPress={onLink} hitSlop={8}>
              <Text style={{ color: C.accent, fontWeight: '600', fontSize: 14 }}>{link}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <View style={[flush ? null : { paddingHorizontal: 20, paddingBottom: 18, gap: 12 }, fill ? { flex: 1 } : null]}>{children}</View>
    </View>
  );
}

/** One of the numbers across the top of a page. Click it to see what it is made of. */
export function Kpi({ label, value, sub, tone, icon, onPress }: {
  label: string; value: string; sub?: string; tone?: 'bad' | 'ok'; icon: IconName; onPress?: () => void;
}) {
  const ink = tone === 'bad' ? C.danger : tone === 'ok' ? C.okInk : C.ink;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label} ${value}`} onPress={onPress} disabled={!onPress}
      style={hoverStyle((hovered) => ({ flex: 1, minWidth: 180, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: hovered && onPress ? '#C9D2E0' : C.line, padding: 18, gap: 6 }))}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name={icon} size={16} color={C.muted} />
        <Text style={{ color: C.muted, fontSize: 13.5, fontWeight: '500' }}>{label}</Text>
      </View>
      <Text raw style={{ color: ink, fontSize: 28, fontWeight: '700', fontFamily: NUM, letterSpacing: -0.5 }} numberOfLines={1}>{value}</Text>
      <Text style={{ color: tone === 'bad' ? C.danger : C.muted, fontSize: 13, minHeight: 18 }} numberOfLines={1}>{sub ?? ' '}</Text>
    </Pressable>
  );
}

const STAGE: Record<JobStage, { fg: string; bg: string }> = {
  draft: { fg: C.ink2, bg: C.cardHi }, sent: { fg: C.accentDark, bg: C.infoBg }, won: { fg: C.okInk, bg: C.okBg }, site: { fg: C.okInk, bg: C.okBg },
  done: { fg: C.muted, bg: C.cardHi }, lost: { fg: C.muted, bg: C.cardHi },
};

/** Where a job stands, as a small colored tag (Draft, Sent, Signed…). */
export function StagePill({ stage, label }: { stage: JobStage; label: string }) {
  return (
    <View style={{ alignSelf: 'flex-start', backgroundColor: STAGE[stage].bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
      <Text style={{ color: STAGE[stage].fg, fontSize: 12.5, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

export interface Col { key: string; label: string; flex?: number; width?: number; right?: boolean }

const cell = (c: Col): ViewStyle => ({ ...(c.width ? { width: c.width } : { flex: c.flex ?? 1 }), minWidth: 0, paddingHorizontal: 12, alignItems: c.right ? 'flex-end' : 'flex-start', justifyContent: 'center' });

/** The line of column names above a table. */
export function TableHead({ cols }: { cols: Col[] }) {
  return (
    <View style={{ flexDirection: 'row', backgroundColor: C.panel, borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.line, paddingHorizontal: 8, height: 38 }}>
      {cols.map((c) => (
        <View key={c.key} style={cell(c)}>
          <Text style={{ color: C.muted, fontSize: 12.5, fontWeight: '600' }} numberOfLines={1}>{c.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** One line of a table; the whole line is the link. `cells` are given in the order of the columns. */
export function TableRow({ cols, cells, onPress, label, first }: { cols: Col[]; cells: React.ReactNode[]; onPress: () => void; label: string; first?: boolean }) {
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={onPress}
      style={hoverStyle((hovered) => ({ flexDirection: 'row' as const, minHeight: 60, paddingVertical: 10, paddingHorizontal: 8, borderTopWidth: first ? 0 : 1, borderColor: C.lineSoft, backgroundColor: hovered ? '#F7F9FC' : C.card, ...clickable }))}>
      {cols.map((c, i) => <View key={c.key} style={cell(c)}>{cells[i]}</View>)}
    </Pressable>
  );
}
