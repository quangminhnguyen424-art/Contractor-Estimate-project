import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { deviceLanguage, LANGUAGES, previewLanguage, setLanguage, useLanguage, type Language } from '@/i18n';
import { BUILT_IN, COMPLETE } from '@/i18n/languages';

import { Button, C, KeyboardSafe } from './kit';
import { Text } from './text';

/**
 * "Your language": the first screen of the app, and Me → Language later. One choice sets the wording of every
 * screen, the language Studwise answers in, and the voice. It is a plain list: tap yours. Ten languages, each named in itself so anyone can find theirs; the phone's own language comes
 * first. On first run, stopping on a built-in language shows the screen in it at once.
 */
export function LanguageScreen({ onDone, first }: { onDone: () => void; first?: boolean }) {
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const device = deviceLanguage();
  const listed = (l: Language | null) => (l && LANGUAGES.some((x) => x.code === l.code) ? l : null);
  const [picked, setPicked] = useState<string>((listed(language) ?? listed(device) ?? LANGUAGES[0]).code);

  // The phone's language first, then the built-in ones, then the rest as listed.
  const top = [...new Set([listed(device)?.code, ...BUILT_IN].filter(Boolean))] as string[];
  const ordered: Language[] = [...top.map((c) => LANGUAGES.find((l) => l.code === c)!), ...LANGUAGES.filter((l) => !top.includes(l.code))];
  const choice = ordered.find((l) => l.code === picked) ?? null;

  const pick = (key: string) => {
    setPicked(key);
    // First run: show this screen in the language at once when it is built in; any other reads in English until it is translated.
    if (first) void previewLanguage((BUILT_IN.includes(key) ? ordered.find((l) => l.code === key) : undefined) ?? LANGUAGES[0]);
  };
  const go = async () => {
    if (!choice) return;
    await setLanguage(choice);
    onDone();
  };

  return (
    <KeyboardSafe style={{ backgroundColor: C.bg }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: first ? insets.top + 24 : 16, paddingHorizontal: 20, paddingBottom: 20, gap: 6, width: '100%', maxWidth: 560, alignSelf: 'center' }}>
        <Text style={{ color: C.ink, fontSize: 26, fontWeight: '700', letterSpacing: -0.4, marginBottom: 14 }}>Your language</Text>
        <View style={{ backgroundColor: C.panel, borderRadius: 16, overflow: 'hidden' }}>
          {ordered.map((l, i) => {
            const on = l.code === picked;
            return (
              <Pressable key={l.code} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={l.english} onPress={() => pick(l.code)}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 16, backgroundColor: pressed ? C.cardHi : 'transparent',
                  borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderColor: C.line })}>
                <Text raw style={{ flex: 1, color: C.ink, fontSize: 17, fontWeight: on ? '600' : '400' }}>{l.name}</Text>
                {l.name !== l.english ? <Text raw style={{ color: C.muted, fontSize: 14 }}>{l.english}</Text> : null}
                <Ionicons name="checkmark" size={20} color={on ? C.accent : 'transparent'} />
              </Pressable>
            );
          })}
        </View>

        {choice && !COMPLETE.includes(choice.code) ? (
          <Text style={{ color: C.muted, fontSize: 13, lineHeight: 18, marginTop: 8 }}>Studwise translates the app into this language after you log in. It takes a few minutes the first time and needs the internet; until then screens show in English.</Text>
        ) : null}
      </ScrollView>

      <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: insets.bottom + 16, backgroundColor: C.bg }}>
        <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center' }}>
          <Button title="Continue" disabled={!choice} onPress={go} />
        </View>
      </View>
    </KeyboardSafe>
  );
}
