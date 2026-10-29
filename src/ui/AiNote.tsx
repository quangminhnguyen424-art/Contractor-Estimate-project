import { Image, Pressable, Text, View } from 'react-native';

import { C } from './kit';

/** One thing Claude noticed. Findings from a photo ("Photo 2: …") show that photo, so you can see it for yourself. */
export function AiNote({ note, photos, onDismiss }: { note: string; photos: string[]; onDismiss?: () => void }) {
  const m = /^Photo\s+(\d+)\s*:\s*/i.exec(note);
  const uri = m ? photos[Number(m[1]) - 1] : undefined;
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
      {uri ? <Image source={{ uri }} accessibilityLabel={`Photo ${m![1]}`} style={{ width: 44, height: 44, borderRadius: 6 }} /> : null}
      <Text style={{ flex: 1, color: C.infoInk, fontSize: 13, lineHeight: 19 }}>
        {m ? <Text style={{ fontWeight: '700' }}>{`Photo ${m[1]}: `}</Text> : '• '}
        {m ? note.slice(m[0].length) : note}
      </Text>
      {onDismiss ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss this finding" onPress={onDismiss} hitSlop={8} style={{ paddingHorizontal: 4 }}>
          <Text style={{ color: C.infoInk, fontSize: 16 }}>×</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
