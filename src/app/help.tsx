import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, TextInput, View, type ScrollViewInstance } from 'react-native';

import type { ChatTurn } from '@/engine/ai';
import { HELP_TOPICS, helpSystem, parseHelpReply, searchHelp, type HelpTopic } from '@/engine/help';
import { SUPPORT_EMAIL } from '@/engine/legal';
import { useApp } from '@/store/AppContext';
import { aiFor } from '@/ui/host';
import { C, List, ListRow, Section } from '@/ui/kit';
import { Text } from '@/ui/text';

const HELP_CENTER = 'https://quangminhnguyen424-art.github.io/Contractor-Estimate-project/help.html';
const POPULAR = ['new-estimate', 'edit-quote', 'sign', 'photos', 'roof-satellite', 'password'];

interface Msg { role: 'user' | 'assistant'; text: string; links?: { route: string; label: string }[]; topics?: HelpTopic[] }

/** Help & support: chat with Bidwell AI about the app, popular how-tos, report a problem, or reach a person. */
export default function HelpScreen() {
  const { apiKey, aiAllowed, profile } = useApp();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null);

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setText('');
    const next: Msg[] = [...msgs, { role: 'user', text: question }];
    setMsgs(next);
    setBusy(true);
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    const turns: ChatTurn[] = next.slice(-10).map((m) => ({ role: m.role, content: m.text }));
    let reply: Msg;
    try {
      const raw = await aiFor(apiKey, aiAllowed).chat(turns, helpSystem({ company: profile?.companyName }));
      const offline = /not connected|only answer when/i.test(raw);
      if (offline) throw new Error('offline');
      const p = parseHelpReply(raw);
      reply = { role: 'assistant', text: p.text, links: p.links };
    } catch {
      // No AI right now: answer from the built-in how-to articles.
      const found = searchHelp(question);
      reply = found.length
        ? { role: 'assistant', text: 'Here is what I found in the how-to guides:', topics: found }
        : { role: 'assistant', text: 'I could not answer that right now. Tap Report a problem below and a person will get back to you.', links: [{ route: '/report', label: 'Report a problem' }] };
    }
    setMsgs((m) => [...m, reply]);
    setBusy(false);
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 24, width: '100%', maxWidth: 640, alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="chatbubbles" size={24} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.ink, fontSize: 20, fontWeight: '700' }}>Chat with Bidwell AI</Text>
            <Text style={{ color: C.muted, fontSize: 13 }}>Ask how to do anything in the app. English or Tiếng Việt, any time.</Text>
          </View>
        </View>

        {msgs.length === 0 ? (
          <View style={{ gap: 8 }}>
            <Text style={{ color: C.ink2, fontWeight: '600' }}>Popular questions</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {POPULAR.map((id) => HELP_TOPICS.find((t) => t.id === id)!).map((t) => (
                <Pressable key={t.id} accessibilityRole="button" onPress={() => ask(`How do I ${t.title.charAt(0).toLowerCase()}${t.title.slice(1)}?`)}
                  style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 }}>
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
              <Text style={{ color: m.role === 'user' ? '#FFFFFF' : C.ink, fontSize: 15, lineHeight: 21 }}>{m.text}</Text>
            </View>
            {m.topics?.map((t) => (
              <View key={t.id} style={{ maxWidth: '88%', backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 12, gap: 6 }}>
                <Text style={{ color: C.ink, fontWeight: '700' }}>{t.title}</Text>
                <Text style={{ color: C.ink2, fontSize: 14, lineHeight: 20 }}>{t.answer}</Text>
                <LinkChip label={t.link} onPress={() => router.push(t.route as never)} />
              </View>
            ))}
            {m.links?.length ? (
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {m.links.map((l) => <LinkChip key={l.route} label={l.label} onPress={() => router.push(l.route as never)} />)}
              </View>
            ) : null}
          </View>
        ))}
        {busy ? <Text style={{ color: C.muted }}>Bidwell is typing…</Text> : null}

        {msgs.length === 0 ? (
          <>
            <Section title="Get help from a person" />
            <List>
              <ListRow icon="bug" title="Report a problem" sub="Something broken or wrong? Send it with one tap." onPress={() => router.push('/report')} />
              <ListRow icon="mail" title="Email support" sub={SUPPORT_EMAIL} onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Bidwell AI help')}`)} />
              <ListRow icon="book" title="Help Center" sub="All how-to guides on the web" onPress={() => Linking.openURL(HELP_CENTER)} />
            </List>
          </>
        ) : null}
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderColor: C.line, backgroundColor: C.card, alignItems: 'flex-end' }}>
        <TextInput value={text} onChangeText={setText} placeholder="Ask a question…" placeholderTextColor={C.muted} multiline maxLength={1000}
          accessibilityLabel="Ask a question"
          style={{ flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, paddingTop: 11, paddingBottom: 11, fontSize: 16, color: C.ink, backgroundColor: C.bg }} />
        <Pressable accessibilityRole="button" accessibilityLabel="Send" onPress={() => ask(text)} disabled={busy || !text.trim()}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: text.trim() && !busy ? C.accent : C.cardHi, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="arrow-up" size={22} color={text.trim() && !busy ? '#FFFFFF' : C.muted} />
        </Pressable>
      </View>
    </View>
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
