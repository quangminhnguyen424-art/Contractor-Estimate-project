import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { CONSENT_ITEMS, missingRequired, PRIVACY_SUMMARY, SUPPORT_EMAIL, TERMS, TERMS_VERSION } from '@/engine/legal';
import { useApp } from '@/store/AppContext';
import { Button, C, Card, H2, Muted, Screen, Segmented } from '@/ui/kit';
import { Text } from '@/ui/text';
import { Tick } from '@/ui/tick';

/**
 * The welcome agreement, before anything else in the app (and again whenever the Terms change).
 * Also opened from Settings to read the Terms or change AI sharing (`?view=1`).
 */
export default function TermsScreen() {
  const { termsOk, acceptTerms, consent, setAiSharing, profile } = useApp();
  const [lang, setLang] = useState<'en' | 'vi'>('en');
  const [ticked, setTicked] = useState<Record<string, boolean>>(() => (termsOk ? { 'ai-share': consent?.ai === true } : ({} as Record<string, boolean>)));
  const [full, setFull] = useState(false);
  const missing = missingRequired(ticked);

  const [accepted, setAccepted] = useState(false);
  const agree = () => {
    acceptTerms(ticked['ai-share'] === true);
    setAccepted(true);
  };
  // Once the agreement is saved, the rest of the app opens: setup for a new user, Home for everyone else.
  useEffect(() => {
    if (accepted && termsOk) router.replace(profile ? '/' : '/onboarding');
  }, [accepted, termsOk, profile]);

  return (
    <Screen footer={termsOk && !accepted ? (
      <Button title="Save" icon="checkmark" onPress={() => { setAiSharing(ticked['ai-share'] === true); router.back(); }} />
    ) : (
      <View style={{ gap: 6 }}>
        <Button title="Agree and continue" icon="checkmark" disabled={missing.length > 0} onPress={agree} />
        {missing.length ? <Muted style={{ textAlign: 'center', fontSize: 13 }}>Tick the required boxes to continue.</Muted> : null}
      </View>
    )}>
      <View style={{ gap: 6, paddingTop: 12 }}>
        <Text style={{ color: C.accent, fontSize: 13, fontWeight: '700', letterSpacing: 1 }}>BIDWELL AI · BETA</Text>
        <Text style={{ color: C.ink, fontSize: 28, fontWeight: '800' }}>{termsOk ? 'Terms and AI' : 'Before you start'}</Text>
        <Muted>Please read and agree. It takes a minute. · Vui lòng đọc và đồng ý.</Muted>
      </View>

      <Segmented options={[{ value: 'en', label: 'English' }, { value: 'vi', label: 'Tiếng Việt' }]} value={lang} onChange={setLang} />

      <Card>
        {CONSENT_ITEMS.map((c) => (
          termsOk && c.required ? (
            <View key={c.id} style={{ flexDirection: 'row', gap: 12, paddingVertical: 8 }}>
              <Ionicons name="checkmark-circle" size={22} color={C.okInk} />
              <Text style={{ flex: 1, color: C.ink2, fontSize: 15 }}>{c[lang]}</Text>
            </View>
          ) : (
            <Tick key={c.id} on={!!ticked[c.id]} required={c.required} onPress={() => setTicked((t) => ({ ...t, [c.id]: !t[c.id] }))}>
              <Text style={{ color: C.ink, fontSize: 16, lineHeight: 22 }}>{c[lang]}</Text>
            </Tick>
          )
        ))}
      </Card>

      <Card>
        <Pressable accessibilityRole="button" onPress={() => setFull(!full)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <H2 style={{ flex: 1 }}>Terms of Use</H2>
          <Ionicons name={full ? 'chevron-up' : 'chevron-down'} size={20} color={C.ink2} />
        </Pressable>
        {full ? TERMS.map((t) => (
          <View key={t.title} style={{ gap: 4 }}>
            <Text style={{ color: C.ink, fontWeight: '700', fontSize: 15 }}>{t.title}</Text>
            <Text style={{ color: C.ink2, fontSize: 14, lineHeight: 21 }}>{t.body}</Text>
          </View>
        )) : <Muted>Tap to read all 14 short sections: AI is a helper, you run your business, messages need permission, your data, no warranty, limits of liability, Washington law.</Muted>}
      </Card>

      <Card>
        <H2>Privacy in short</H2>
        {PRIVACY_SUMMARY.map((p) => (
          <View key={p} style={{ flexDirection: 'row', gap: 8 }}>
            <Text style={{ color: C.accent }}>•</Text>
            <Text style={{ flex: 1, color: C.ink2, fontSize: 14, lineHeight: 21 }}>{p}</Text>
          </View>
        ))}
      </Card>

      <Muted style={{ fontSize: 12, textAlign: 'center' }}>Version {TERMS_VERSION} · Questions: {SUPPORT_EMAIL}</Muted>
    </Screen>
  );
}
