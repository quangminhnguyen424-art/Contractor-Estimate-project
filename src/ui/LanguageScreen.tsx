import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { deviceLanguage, LANGUAGES, previewLanguage, setLanguage, useLanguage, type Language } from '@/i18n';
import { BUILT_IN, COMPLETE } from '@/i18n/languages';

import { Button, C, KeyboardSafe } from './kit';
import { Text } from './text';
import { Wheel } from './Wheel';

/**
 * "Your language": the first screen of the app, and Me → Language later. One choice sets the wording of every
 * screen, the language Bidwell answers in, and the voice. It is a scroll wheel: roll it and the language in the
 * middle is the choice. Ten languages, each named in itself so anyone can find theirs; the phone's own language comes
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
        {first ? (
          <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
            <Ionicons name="language" size={28} color="#FFFFFF" />
          </View>
        ) : null}
        <Text style={{ color: C.ink, fontSize: 28, fontWeight: '700', letterSpacing: -0.4 }}>Your language</Text>
        <Text style={{ color: C.ink2, fontSize: 15, lineHeight: 21, marginBottom: 12 }}>The whole app, Bidwell’s answers and the voice use it. You can change it later in the Me tab.</Text>

        <Wheel label="Your language" value={picked} onChange={pick}
          options={ordered.map((l) => ({ key: l.code, label: l.name, sub: l.name !== l.english ? l.english : undefined, raw: true }))} />

        {choice && !COMPLETE.includes(choice.code) ? (
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
