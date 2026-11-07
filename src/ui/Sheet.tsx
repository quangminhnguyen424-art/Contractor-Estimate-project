import Ionicons from '@expo/vector-icons/Ionicons';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C } from './kit';
import { Text } from './text';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
export interface SheetAction { icon: IconName; label: string; sub?: string; onPress: () => void; disabled?: boolean }

/** A menu that slides up from the bottom (like the iPhone share menu). */
export function ActionSheet({ visible, onClose, title, actions }: { visible: boolean; onClose: () => void; title?: string; actions: SheetAction[] }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(11,19,36,0.45)', justifyContent: 'flex-end' }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: C.card, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 16, paddingBottom: insets.bottom + 16, gap: 4, width: '100%', maxWidth: 640, alignSelf: 'center' }}>
          <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: C.line, marginBottom: 8 }} />
          {title ? <Text style={{ color: C.ink, fontSize: 18, fontWeight: '700', paddingHorizontal: 8, paddingBottom: 6 }}>{title}</Text> : null}
          {actions.map((a) => (
            <Pressable key={a.label} accessibilityRole="button" disabled={a.disabled} onPress={() => { onClose(); setTimeout(a.onPress, 250); }}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, borderRadius: 14, opacity: a.disabled ? 0.45 : 1, backgroundColor: pressed ? C.cardHi : 'transparent' })}>
              <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: C.accentTint, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={a.icon} size={22} color={C.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.ink, fontSize: 16, fontWeight: '600' }}>{a.label}</Text>
                {a.sub ? <Text style={{ color: C.muted, fontSize: 13 }}>{a.sub}</Text> : null}
              </View>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
