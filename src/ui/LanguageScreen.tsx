import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { customLanguage, deviceLanguage, LANGUAGES, previewLanguage, setLanguage, useLanguage, type Language } from '@/i18n';
import { BUILT_IN, COMPLETE } from '@/i18n/languages';

import { Button, C, KeyboardSafe } from './kit';
import { Text, TextInput } from './text';
import { Wheel } from './Wheel';

const OTHER = 'other';

/**
 * "Your language": the first screen of the app, and Me → Language later. One choice sets the wording of every
 * screen, the language Bidwell answers in, and the voice. It is a scroll wheel: roll it and the language in the
 * middle is the choice. Names are in their own language so anyone can find theirs; the phone's own language comes
 * first. The last row, "Another language", opens a box to type any language. On first run, stopping on a built-in
 * language shows the screen in it at once.
 */
export function LanguageScreen({ onDone, first }: { onDone: () => void; first?: boolean }) {
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const device = deviceLanguage();
  const own = !!language && !LANGUAGES.some((l) => l.code === language.code); // a language the user typed in earlier
  const [picked, setPicked] = useState<string>(own ? OTHER : (language ?? device ?? LANGUAGES[0]).code);
  const [other, setOther] = useState(own && language ? language.name : '');

  // The phone's language first, then the built-in ones, then the rest as listed.
  const top = [...new Set([device?.code, ...BUILT_IN].filter(Boolean))] as string[];
  const ordered: Language[] = [...top.map((c) => LANGUAGES.find((l) => l.code === c)!), ...LANGUAGES.filter((l) => !top.includes(l.code))];
  const typed = other.trim();
  const choice = picked === OTHER ? (typed ? customLanguage(typed) : null) : ordered.find((l) => l.code === picked) ?? null;

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
        {first ? (
          <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
            <Ionicons name="language" size={28} color="#FFFFFF" />
          </View>
        ) : null}
        <Text style={{ color: C.ink, fontSize: 28, fontWeight: '700', letterSpacing: -0.4 }}>Your language</Text>
        <Text style={{ color: C.ink2, fontSize: 15, lineHeight: 21, marginBottom: 12 }}>The whole app, Bidwell’s answers and the voice use it. You can change it later in the Me tab.</Text>

        <Wheel label="Your language" value={picked} onChange={pick}
          options={[
            ...ordered.map((l) => ({ key: l.code, label: l.name, sub: l.name !== l.english ? l.english : undefined, raw: true })),
            { key: OTHER, label: 'Another language' },
          ]} />

        {/* Any other language: the user writes its name and Bidwell translates the app into it. */}
        {picked === OTHER ? (
          <TextInput value={other} onChangeText={setOther} placeholder="Type its name" placeholderTextColor={C.muted}
            accessibilityLabel="Another language" autoCorrect={false} maxLength={40}
            style={{ height: 50, borderRadius: 14, borderWidth: 1, borderColor: typed ? C.accent : C.line, backgroundColor: C.card, paddingHorizontal: 14, fontSize: 17, color: C.ink, marginTop: 10 }} />
        ) : null}
        {picked === OTHER || (choice && !COMPLETE.includes(choice.code)) ? (
          <Text style={{ color: C.muted, fontSize: 13, lineHeight: 18, marginTop: 8 }}>Bidwell translates the app into this language after you log in. It takes a few minutes the first time and needs the internet; until then screens show in English.</Text>
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
