import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { customLanguage, deviceLanguage, LANGUAGES, previewLanguage, setLanguage, useLanguage, type Language } from '@/i18n';
import { BUILT_IN, COMPLETE } from '@/i18n/languages';

import { Button, C, KeyboardSafe } from './kit';
import { Text, TextInput } from './text';

/**
 * "Your language": the first screen of the app, and Me → Language later. One choice sets the wording of every
 * screen, the language Bidwell answers in, and the voice. Names are shown in their own language so anyone can
 * find theirs; the phone's own language is offered first. On first run, tapping a built-in language shows the
 * screen in it at once.
 */
export function LanguageScreen({ onDone, first }: { onDone: () => void; first?: boolean }) {
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const device = deviceLanguage();
  const [picked, setPicked] = useState<Language | null>(language ?? device ?? LANGUAGES[0]);
  const [q, setQ] = useState('');
  const [other, setOther] = useState(language && !LANGUAGES.some((l) => l.code === language.code) ? language.name : '');
  const [typing, setTyping] = useState(false);

  // The phone's language first, then the built-in ones, then the rest as listed.
  const top = [...new Set([device?.code, ...BUILT_IN].filter(Boolean))] as string[];
  const ordered = [...top.map((c) => LANGUAGES.find((l) => l.code === c)!), ...LANGUAGES.filter((l) => !top.includes(l.code))];
  const needle = q.trim().toLowerCase();
  const shown = needle ? ordered.filter((l) => `${l.name} ${l.english}`.toLowerCase().includes(needle)) : ordered;
  const typed = other.trim();
  const choice = typing && typed ? customLanguage(typed) : picked;

  const go = async () => {
    if (!choice) return;
    await setLanguage(choice);
    onDone();
  };

  return (
    <KeyboardSafe style={{ backgroundColor: C.bg }}>
      <View style={{ paddingTop: first ? insets.top + 24 : 16, paddingHorizontal: 20, gap: 6, width: '100%', maxWidth: 560, alignSelf: 'center' }}>
        {first ? (
          <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
            <Ionicons name="language" size={28} color="#FFFFFF" />
          </View>
        ) : null}
        <Text style={{ color: C.ink, fontSize: 28, fontWeight: '700', letterSpacing: -0.4 }}>Your language</Text>
        <Text style={{ color: C.ink2, fontSize: 15, lineHeight: 21 }}>The whole app, Bidwell’s answers and the voice use it. You can change it later in the Me tab.</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, height: 46, marginTop: 10 }}>
          <Ionicons name="search" size={18} color={C.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search" placeholderTextColor={C.muted} accessibilityLabel="Search languages"
            autoCorrect={false} style={{ flex: 1, fontSize: 16, color: C.ink, height: 46 }} />
        </View>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingTop: 12, gap: 8, width: '100%', maxWidth: 560, alignSelf: 'center' }}>
        {shown.map((l) => {
          const on = !typing && picked?.code === l.code;
          return (
            <Pressable key={l.code} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${l.name}, ${l.english}`}
              onPress={() => { setPicked(l); setTyping(false); if (first && BUILT_IN.includes(l.code)) void previewLanguage(l); }}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14,
                borderWidth: on ? 2 : 1, borderColor: on ? C.accent : C.line, backgroundColor: on ? C.accentTint : pressed ? C.cardHi : C.card })}>
              <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? C.accent : C.muted} />
              <View style={{ flex: 1 }}>
                <Text raw style={{ color: C.ink, fontSize: 17, fontWeight: on ? '700' : '500' }}>{l.name}</Text>
                {l.name !== l.english ? <Text raw style={{ color: C.muted, fontSize: 13 }}>{l.english}</Text> : null}
              </View>
            </Pressable>
          );
        })}

        {/* Any other language: the user writes its name and Bidwell translates the app into it. */}
        <View style={{ borderRadius: 14, borderWidth: typing && typed ? 2 : 1, borderColor: typing && typed ? C.accent : C.line, backgroundColor: typing && typed ? C.accentTint : C.card, padding: 14, gap: 8 }}>
          <Text style={{ color: C.ink, fontSize: 16, fontWeight: '600' }}>Another language</Text>
          <TextInput value={other} onChangeText={(v) => { setOther(v); setTyping(true); }} onFocus={() => setTyping(true)} placeholder="Type its name" placeholderTextColor={C.muted}
            accessibilityLabel="Another language" autoCorrect={false} maxLength={40}
            style={{ height: 46, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, paddingHorizontal: 12, fontSize: 16, color: C.ink }} />
        </View>
        {choice && !COMPLETE.includes(choice.code) ? (
          <Text style={{ color: C.muted, fontSize: 13, lineHeight: 18 }}>Bidwell translates the app into this language after you log in. It takes a few minutes the first time and needs the internet; until then screens show in English.</Text>
        ) : null}
      </ScrollView>

      <View style={{ padding: 16, paddingBottom: insets.bottom + 16, borderTopWidth: 1, borderColor: C.line, backgroundColor: C.bg }}>
        <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center' }}>
          <Button title="Continue" icon="arrow-forward" disabled={!choice} onPress={go} />
        </View>
      </View>
    </KeyboardSafe>
  );
}
