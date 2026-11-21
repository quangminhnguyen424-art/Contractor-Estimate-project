import { useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View, type ScrollViewInstance } from 'react-native';

import { useCloud } from '@/cloud/CloudProvider';
import type { ChatTurn } from '@/engine/ai';
import { assistantSystem, parseAssistantReply } from '@/engine/assistant';
import { newId } from '@/engine/format';
import { aiLanguageLine } from '@/i18n';
import { useApp } from '@/store/AppContext';
import { useChat, type ChatMessage } from '@/store/chat';
import { Composer } from '@/ui/Composer';
import { Dashboard } from '@/ui/Dashboard';
import { aiFor, inClaudeApp } from '@/ui/host';
import { C, KeyboardSafe } from '@/ui/kit';
import { TypingDots } from '@/ui/motion';
import { confirmAction, notify } from '@/ui/notify';
import { startEstimateFromChat } from '@/ui/startEstimate';
import { Text } from '@/ui/text';
import { speak, stopSpeaking } from '@/ui/voice';

/**
 * Home: what needs you today, and Studwise at the bottom. Asking something opens the chat; "Home" brings the
 * day back, and the chat is still there to continue.
 */
export default function Assistant() {
  const { profile, presets, pastJobs, estimates, apiKey, setDraft, aiAllowed, lessons } = useApp();
  const { messages, add, clear, settings, setSettings, current } = useChat();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const busyRef = useRef(false);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const cloud = useCloud();
  const claudeOn = aiAllowed && (inClaudeApp || !!apiKey || !!cloud.user);

  useEffect(() => () => { stopSpeaking(); }, []);
  // Tabs stay mounted: stop reading aloud when another tab or screen comes to the front.
  useFocusEffect(useCallback(() => () => { stopSpeaking(); }, []));

  const send = async (raw: string) => {
    const q = raw.trim();
    if (!q || busyRef.current || !profile) return;
    busyRef.current = true;
    setText('');
    setChatOpen(true);
    stopSpeaking();
    add({ id: newId(), role: 'user', text: q });
    setBusy(true);
    // Recent conversation only: older turns are dropped so each question stays fast and cheap.
    // (The question was just added above, so it is already the last message.)
    const turns: ChatTurn[] = current.current
      .filter((m) => !m.error).slice(-16)
      .map((m) => ({ role: m.role, content: m.text || '(started an estimate)' }));
    while (turns.length && turns[0].role !== 'user') turns.shift();
    try {
      const reply = await aiFor(apiKey, aiAllowed).chat(turns, assistantSystem({ profile, presets, pastJobs, estimates }) + aiLanguageLine());
      const { text: answer, action } = parseAssistantReply(reply);
      if (!answer.trim() && !action) throw new Error('Studwise could not answer. Try again.');
      add({ id: newId(), role: 'assistant', text: answer, action });
      if (settings.speak) speak(answer);
    } catch (e) {
      add({ id: newId(), role: 'assistant', text: e instanceof Error ? e.message : 'Studwise could not answer. Try again.', error: true });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const start = async (m: ChatMessage) => {
    if (!m.action) return;
    setStarting(m.id);
    try {
      await startEstimateFromChat(m.action, { apiKey, aiAllowed, profile, pastJobs, lessons, estimates, setDraft });
    } catch {
      notify('Could not start the estimate', 'Try again, or tap the orange + to start it yourself.');
    } finally {
      setStarting(null);
    }
  };


  const showChat = chatOpen && messages.length > 0;
  return (
    <KeyboardSafe style={{ backgroundColor: C.bg }}>
      {showChat ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingTop: 4 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to Home" onPress={() => { stopSpeaking(); setChatOpen(false); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 2, padding: 8, flex: 1 }}>
            <Ionicons name="chevron-back" size={20} color={C.accent} />
            <Text style={{ color: C.accent, fontSize: 16, fontWeight: '600' }}>Home</Text>
          </Pressable>
          <Pressable accessibilityRole="switch" accessibilityState={{ checked: settings.speak }} accessibilityLabel="Read answers aloud"
            onPress={() => { if (settings.speak) stopSpeaking(); setSettings({ ...settings, speak: !settings.speak }); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 8 }}>
            <Ionicons name={settings.speak ? 'volume-high' : 'volume-mute'} size={20} color={settings.speak ? C.accent : C.muted} />
            <Text style={{ color: settings.speak ? C.accent : C.muted, fontSize: 13, fontWeight: '600' }}>{settings.speak ? 'Voice on' : 'Voice off'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Clear chat" style={{ padding: 8 }}
            onPress={() => confirmAction('Clear the chat?', 'Your jobs are not affected.', 'Clear', () => { stopSpeaking(); clear(); setChatOpen(false); })}>
            <Ionicons name="trash-outline" size={19} color={C.muted} />
          </Pressable>
        </View>
      ) : null}

      <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
        onContentSizeChange={() => { if (showChat) scrollRef.current?.scrollToEnd({ animated: true }); }}
        contentContainerStyle={{ padding: 16, gap: 10, width: '100%', maxWidth: 760, alignSelf: 'center', flexGrow: 1 }}>
        {showChat ? (
          <>
            {messages.map((m) => (
              <View key={m.id} style={{ alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', gap: 6 }}>
                <View style={{
                  maxWidth: '88%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10,
                  backgroundColor: m.role === 'user' ? C.accent : m.error ? C.warnBg : C.card,
                  borderWidth: m.role === 'user' ? 0 : 1, borderColor: C.line,
                }}>
                  <Text raw={!m.error} selectable style={{ color: m.role === 'user' ? C.onAccent : m.error ? C.warnInk : C.ink, fontSize: 16, lineHeight: 23 }}>{m.text}</Text>
                </View>
                {m.role === 'assistant' && !m.error ? (
                  <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                    {m.action ? (
                      <Pressable accessibilityRole="button" disabled={!!starting} onPress={() => start(m)}
                        style={{ backgroundColor: C.accent, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 9, opacity: starting ? 0.6 : 1 }}>
                        <Text style={{ color: C.onAccent, fontWeight: '700' }}>
                          {starting === m.id ? 'Opening…' : `Start this estimate${m.action.title ? `: ${m.action.title}` : ''}`}
                        </Text>
                      </Pressable>
                    ) : null}
                    <Pressable accessibilityRole="button" accessibilityLabel="Read this answer aloud" onPress={() => speak(m.text)} hitSlop={8}>
                      <Ionicons name="volume-medium-outline" size={18} color={C.muted} />
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ))}
            {busy ? (
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: C.card, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 6, alignSelf: 'flex-start', borderWidth: 1, borderColor: C.line }}>
                <TypingDots />
              </View>
            ) : null}
          </>
        ) : (
          <Dashboard claudeOn={claudeOn} chatCount={messages.length} onOpenChat={() => setChatOpen(true)} />
        )}
      </ScrollView>

      <View style={{ backgroundColor: C.bg, paddingHorizontal: 12, paddingVertical: 8 }}>
        <View style={{ width: '100%', maxWidth: 740, alignSelf: 'center' }}>
          <Composer value={text} onChange={setText} onSend={() => send(text)} sending={busy} inputLabel="Ask Studwise"
            placeholder="Ask Studwise anything…" />
        </View>
      </View>
    </KeyboardSafe>
  );
}
