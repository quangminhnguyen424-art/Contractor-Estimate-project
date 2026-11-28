import Ionicons from '@expo/vector-icons/Ionicons';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C } from './theme';
import { Text } from './text';
import { useWide } from './wide';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
export interface SheetAction { icon: IconName; label: string; sub?: string; onPress: () => void; disabled?: boolean; danger?: boolean }

/** How long to wait after closing a sheet before opening the camera, a share menu or another screen (iPhone needs the sheet gone first). */
export const AFTER_SHEET_MS = 320;

/**
 * The one bottom sheet of the app: slides up from the bottom with a grabber and a title. Menus, drop-down choices
 * and small forms all use it, so they look and close the same way (tap outside, or swipe-back on Android).
 */
export function Sheet({ visible, onClose, title, children, scroll, listRef, onShow }: {
  visible: boolean; onClose: () => void; title?: string; children: React.ReactNode;
  /** Long content (a list of choices) scrolls inside the sheet. */
  scroll?: boolean; listRef?: React.RefObject<ScrollViewInstance | null>; onShow?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const wide = useWide();
  // On a computer screen the same thing is a dialog in the middle of the window.
  const box = wide
    ? { backgroundColor: C.card, borderRadius: 18, maxHeight: '82%' as const, paddingBottom: 14, width: '100%' as const, maxWidth: 520, alignSelf: 'center' as const, shadowColor: '#0B1324', shadowOpacity: 0.22, shadowRadius: 40, shadowOffset: { width: 0, height: 16 } }
    : { backgroundColor: C.card, borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: '80%' as const, paddingBottom: insets.bottom + 12, width: '100%' as const, maxWidth: 640, alignSelf: 'center' as const };
  return (
    <Modal visible={visible} transparent animationType={wide ? 'fade' : 'slide'} onRequestClose={onClose} onShow={onShow}>
      {/* A sheet with text boxes (a small form) rides up with the keyboard instead of hiding under it. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable accessibilityLabel="Close" onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(11,19,36,0.45)', justifyContent: wide ? 'center' : 'flex-end', padding: wide ? 24 : 0 }}>
        <Pressable onPress={() => {}} style={[box, wide ? ({ cursor: 'auto' } as object) : null]}>
          {wide ? null : <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: C.line, marginTop: 10 }} />}
          {title ? <Text style={{ color: C.ink, fontSize: 18, fontWeight: '700', paddingHorizontal: 20, paddingTop: wide ? 20 : 14, paddingBottom: 4 }}>{title}</Text> : null}
          {scroll ? (
            <ScrollView ref={listRef} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4, gap: 6 }}>{children}</ScrollView>
          ) : (
            <View style={{ paddingHorizontal: 12, paddingTop: 8, gap: 4 }}>{children}</View>
          )}
        </Pressable>
      </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** A menu of actions in the bottom sheet (like the iPhone share menu). The sheet closes first, then the action runs. */
export function ActionSheet({ visible, onClose, title, actions }: { visible: boolean; onClose: () => void; title?: string; actions: SheetAction[] }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title} scroll={actions.length > 6}>
      {actions.map((a) => (
        <Pressable key={a.label} accessibilityRole="button" disabled={a.disabled} onPress={() => { onClose(); setTimeout(a.onPress, AFTER_SHEET_MS); }}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 10, borderRadius: 14, opacity: a.disabled ? 0.45 : 1, backgroundColor: pressed ? C.cardHi : 'transparent' })}>
          <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: a.danger ? C.badBg : C.accentTint, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={a.icon} size={22} color={a.danger ? C.danger : C.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: a.danger ? C.danger : C.ink, fontSize: 16, fontWeight: '600' }}>{a.label}</Text>
            {a.sub ? <Text style={{ color: C.muted, fontSize: 13 }}>{a.sub}</Text> : null}
          </View>
        </Pressable>
      ))}
    </Sheet>
  );
}
