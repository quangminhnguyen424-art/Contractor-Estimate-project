import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, View } from 'react-native';

import { C } from './kit';
import { Text } from './text';

/** A box the user ticks. Big touch target; works with a screen reader. */
export function Tick({ on, onPress, children, required }: { on: boolean; onPress: () => void; children: React.ReactNode; required?: boolean }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={onPress} hitSlop={4}
      style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 10 }}>
      <Ionicons name={on ? 'checkbox' : 'square-outline'} size={26} color={on ? C.accent : C.ink2} />
      <View style={{ flex: 1, gap: 2 }}>
        {children}
        {!required ? <Text style={{ color: C.muted, fontSize: 12 }}>Optional · Không bắt buộc</Text> : null}
      </View>
    </Pressable>
  );
}

