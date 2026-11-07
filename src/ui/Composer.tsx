import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C } from './kit';
import { Wave } from './motion';
import { notify } from './notify';
import { Text } from './text';
import { listen, voiceInputAvailable, type VoiceLang } from './voice';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
export interface ComposerAction { icon: IconName; label: string; sub?: string; onPress: () => void }

/**
 * A message box like a chat app: + for photos and more, the text, a microphone to talk, and an arrow to send.
 * Talking fills the box (it does not send by itself), so the contractor can fix a word before sending.
 */
export function Composer({ value, onChange, onSend, actions, placeholder, sending, lang = 'en-US', sendLabel = 'Send' }: {
  value: string; onChange: (t: string) => void; onSend: () => void; actions: ComposerAction[]; placeholder: string;
  sending?: boolean; lang?: VoiceLang; sendLabel?: string;
}) {
  const insets = useSafeAreaInsets();
  const [menu, setMenu] = useState(false);
  const [listening, setListening] = useState(false);
  const stopRef = useRef<{ stop(): void } | null>(null);
  const before = useRef('');
  useEffect(() => () => stopRef.current?.stop(), []);

  const mic = async () => {
    if (listening) { stopRef.current?.stop(); return; }
    if (!voiceInputAvailable()) {
      notify('Talk with your keyboard', 'Tap the box, then the microphone on your keyboard, and speak.');
      return;
    }
    before.current = value.trim() ? `${value.trim()} ` : '';
    setListening(true);
    const h = await listen(lang, {
      onPartial: (t) => onChange(before.current + t),
      onFinal: (t) => onChange(before.current + t),
      onError: (m) => notify('Voice', m),
      onEnd: () => { setListening(false); stopRef.current = null; },
    });
    if (!h) setListening(false);
    stopRef.current = h;
  };

  const canSend = !sending;
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Add photos, scan or client" onPress={() => setMenu(true)}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.cardHi, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="add" size={26} color={C.ink} />
        </Pressable>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', minHeight: 44, borderRadius: 22, borderWidth: 1, borderColor: listening ? C.accent : C.line, backgroundColor: C.card, paddingLeft: 14, paddingRight: 4 }}>
          <TextInput value={value} onChangeText={onChange} placeholder={listening ? 'Listening… talk now' : placeholder} placeholderTextColor={C.muted}
            multiline maxLength={4000} accessibilityLabel="Describe the job"
            style={{ flex: 1, fontSize: 16, color: C.ink, paddingTop: 11, paddingBottom: 11, maxHeight: 140 }} />
          <Pressable accessibilityRole="button" accessibilityLabel={listening ? 'Stop listening' : 'Talk'} onPress={mic}
            style={{ width: 36, height: 36, borderRadius: 18, margin: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: listening ? C.accent : 'transparent' }}>
            {listening ? <Wave color={C.onAccent} /> : <Ionicons name="mic" size={22} color={C.ink2} />}
          </Pressable>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={sendLabel} onPress={onSend} disabled={!canSend}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: canSend ? C.accent : C.cardHi, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="arrow-up" size={24} color={canSend ? '#FFFFFF' : C.muted} />
        </Pressable>
      </View>

      <Modal visible={menu} transparent animationType="slide" onRequestClose={() => setMenu(false)}>
        <Pressable accessibilityLabel="Close" onPress={() => setMenu(false)} style={{ flex: 1, backgroundColor: 'rgba(11,19,36,0.45)', justifyContent: 'flex-end' }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: C.card, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 16, paddingBottom: insets.bottom + 16, gap: 6, width: '100%', maxWidth: 640, alignSelf: 'center' }}>
            <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: C.line, marginBottom: 8 }} />
            {actions.map((a) => (
              <Pressable key={a.label} accessibilityRole="button" onPress={() => { setMenu(false); setTimeout(a.onPress, 250); }}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, borderRadius: 14, backgroundColor: pressed ? C.cardHi : 'transparent' })}>
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
    </>
  );
}
