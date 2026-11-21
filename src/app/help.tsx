import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ChatTurn } from '@/engine/ai';
import { HELP_TOPICS, helpSystem, parseHelpReply, searchHelp, type HelpTopic } from '@/engine/help';
import { COMPANY } from '@/engine/company';
import { SUPPORT_EMAIL } from '@/engine/legal';
import { TUTORIALS, tutorialUrl } from '@/engine/tutorials';
import { aiLanguageLine, currentLanguage } from '@/i18n';
import { useApp } from '@/store/AppContext';
import { Composer } from '@/ui/Composer';
import { aiFor } from '@/ui/host';
import { C, KeyboardSafe, List, ListRow, Section } from '@/ui/kit';
import { Text } from '@/ui/text';

const TABS = new Set(['/', '/jobs', '/new', '/schedule', '/me']);
/** Opens a screen named in a help answer. A tab is returned to (never stacked as a second copy on top of Help). */
const open = (route: string) => (TABS.has(route.split('?')[0]) ? router.dismissTo(route as never) : router.push(route as never));

const HELP_CENTER = COMPANY.pages.help;
const POPULAR = ['new-estimate', 'edit-quote', 'sign', 'photos', 'roof-satellite', 'password'];

/** `own`: a line the app wrote (translated on screen); anything else is shown as written. `why`: why the AI did not answer. */
interface Msg { role: 'user' | 'assistant'; text: string; links?: { route: string; label: string }[]; topics?: HelpTopic[]; own?: boolean; why?: string }

/** Help and support: chat with Studwise AI about the app, popular how-tos, report a problem, or reach a person. */
export default function HelpScreen() {
  const { apiKey, aiAllowed, profile } = useApp();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null);
  const insets = useSafeAreaInsets();

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setText('');
    const next: Msg[] = [...msgs, { role: 'user', text: question }];
    setMsgs(next);
    setBusy(true);
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    const turns: ChatTurn[] = next.filter((m) => !m.own).slice(-10).map((m) => ({ role: m.role, content: m.text }));
    while (turns.length && turns[0].role !== 'user') turns.shift(); // a conversation sent to the AI starts with the user
    let reply: Msg;
    try {
      const raw = await aiFor(apiKey, aiAllowed).chat(turns, helpSystem({ company: profile?.companyName }) + aiLanguageLine());
      const p = parseHelpReply(raw);
      reply = { role: 'assistant', text: p.text, links: p.links };
    } catch (e) {
      // No AI right now: say why, and answer from the built-in how-to articles.
      const why = e instanceof Error ? e.message : undefined;
      const found = searchHelp(question);
      reply = found.length
        ? { role: 'assistant', own: true, why, text: 'Here is what I found in the how-to guides:', topics: found }
        : { role: 'assistant', own: true, why, text: 'I could not answer that right now. Tap Report a problem below and a person will get back to you.', links: [{ route: '/report', label: 'Report a problem' }] };
    }
    setMsgs((m) => [...m, reply]);
    setBusy(false);
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
  };

  return (
    <KeyboardSafe style={{ backgroundColor: C.bg }}>
      <ScrollView ref={scroll} keyboardDismissMode="interactive" onContentSizeChange={() => { if (msgs.length) scroll.current?.scrollToEnd({ animated: true }); }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 24, width: '100%', maxWidth: 640, alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="chatbubbles" size={24} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.ink, fontSize: 20, fontWeight: '700' }}>Chat with Studwise AI</Text>
            <Text style={{ color: C.muted, fontSize: 13 }}>Ask how to do anything in the app, any time, in your language.</Text>
          </View>
        </View>

        {msgs.length === 0 ? (
          <View style={{ gap: 8 }}>
            <Text style={{ color: C.ink2, fontWeight: '600' }}>Popular questions</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {POPULAR.map((id) => HELP_TOPICS.find((t) => t.id === id)!).map((t) => (
                <Pressable key={t.id} accessibilityRole="button" onPress={() => ask(`How do I ${t.title.charAt(0).toLowerCase()}${t.title.slice(1)}?`)}
                  style={{ backgroundColor: C.panel, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 }}>
                  <Text style={{ color: C.ink, fontSize: 14 }}>{t.title}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {msgs.map((m, i) => (
          <View key={i} style={{ alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', gap: 6 }}>
            <View style={{ maxWidth: '88%', backgroundColor: m.role === 'user' ? C.accent : C.card, borderRadius: 18, padding: 12,
              borderWidth: m.role === 'user' ? 0 : 1, borderColor: C.line }}>
              {m.why ? <Text style={{ color: C.muted, fontSize: 13, lineHeight: 18, marginBottom: 6 }}>{m.why}</Text> : null}
              <Text raw={!m.own} style={{ color: m.role === 'user' ? '#FFFFFF' : C.ink, fontSize: 15, lineHeight: 21 }}>{m.text}</Text>
            </View>
            {m.topics?.map((t) => (
              <View key={t.id} style={{ maxWidth: '88%', backgroundColor: C.panel, borderRadius: 16, padding: 12, gap: 6 }}>
                <Text style={{ color: C.ink, fontWeight: '700' }}>{t.title}</Text>
                <Text style={{ color: C.ink2, fontSize: 14, lineHeight: 20 }}>{t.answer}</Text>
                <LinkChip label={t.link} onPress={() => open(t.route)} />
              </View>
            ))}
            {m.links?.length ? (
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {m.links.map((l) => <LinkChip key={l.route} label={l.label} onPress={() => open(l.route)} />)}
              </View>
            ) : null}
          </View>
        ))}
        {busy ? <Text style={{ color: C.muted }}>Studwise is typing…</Text> : null}

        {msgs.length === 0 ? (
          <>
            <Section title="Video guides" />
            <List>
              {TUTORIALS.map((v) => (
                <ListRow key={v.id} icon="play-circle" title={v.title} sub={v.sub}
                  onPress={() => { WebBrowser.openBrowserAsync(tutorialUrl(v.id, currentLanguage()?.code)).catch(() => Linking.openURL(tutorialUrl(v.id, currentLanguage()?.code))); }} />
              ))}
            </List>
            <Section title="Get help from a person" />
            <List>
              <ListRow icon="bug" title="Report a problem" sub="Something broken or wrong? Send it with one tap." onPress={() => router.push('/report')} />
              <ListRow icon="mail" title="Email support" sub={SUPPORT_EMAIL} onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Studwise AI help')}`)} />
              {COMPANY.phone ? <ListRow icon="call" title="Call support" sub={COMPANY.phone} onPress={() => Linking.openURL(`tel:${COMPANY.phone.replace(/[^\d+]/g, '')}`)} /> : null}
              <ListRow icon="book" title="Help Center" sub="All how-to guides on the web" onPress={() => Linking.openURL(HELP_CENTER)} />
              <ListRow icon="shield-checkmark" title="Privacy Policy" onPress={() => Linking.openURL(COMPANY.pages.privacy)} />
            </List>
          </>
        ) : null}
      </ScrollView>

      <View style={{ padding: 10, paddingBottom: 10 + insets.bottom, borderTopWidth: 1, borderColor: C.line, backgroundColor: C.bg }}>
        <View style={{ width: '100%', maxWidth: 620, alignSelf: 'center' }}>
          <Composer value={text} onChange={setText} onSend={() => ask(text)} sending={busy} placeholder="Ask how to do something…" inputLabel="Ask a question" maxLength={1000} />
        </View>
      </View>
    </KeyboardSafe>
  );
}

function LinkChip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.accentTint, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start' }}>
      <Text style={{ color: C.accent, fontWeight: '600', fontSize: 14 }}>Open {label}</Text>
      <Ionicons name="arrow-forward" size={14} color={C.accent} />
    </Pressable>
  );
}
