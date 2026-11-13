import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Wave } from './motion';
import { notify } from './notify';
import { ActionSheet, type SheetAction } from './Sheet';
import { TextInput } from './text';
import { C } from './theme';
import { listen, voiceInputAvailable, type VoiceLang } from './voice';

export type ComposerAction = SheetAction;

/**
 * The one message box of the app (Home, New estimate, Help): + for photos and more, the text, a microphone to
 * talk, and an arrow to send. Talking fills the box (it does not send by itself), so a word can be fixed first.
 */
export function Composer({ value, onChange, onSend, actions = [], placeholder, sending, lang = 'en-US', sendLabel = 'Send', inputLabel = 'Message', allowEmpty, maxLength = 4000 }: {
  value: string; onChange: (t: string) => void; onSend: () => void;
  /** What the + offers. Leave out for a plain message box without the +. */
  actions?: ComposerAction[];
  placeholder: string; sending?: boolean; lang?: VoiceLang; sendLabel?: string; inputLabel?: string;
  /** New estimate can go on with photos or a scan and no words. */
  allowEmpty?: boolean; maxLength?: number;
}) {
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

  const canSend = !sending && (allowEmpty || !!value.trim());
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        {actions.length ? (
          <Pressable accessibilityRole="button" accessibilityLabel="More options" onPress={() => setMenu(true)}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.cardHi, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="add" size={26} color={C.ink} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', minHeight: 44, borderRadius: 22, borderWidth: 1, borderColor: listening ? C.accent : C.line, backgroundColor: C.card, paddingLeft: 14, paddingRight: 4 }}>
          <TextInput value={value} onChangeText={onChange} placeholder={listening ? 'Listening… talk now' : placeholder} placeholderTextColor={C.muted}
            multiline maxLength={maxLength} accessibilityLabel={inputLabel}
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

      <ActionSheet visible={menu} onClose={() => setMenu(false)} actions={actions} />
    </>
  );
}
