import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View, type ScrollViewInstance } from 'react-native';

import { assistantSystem, parseAssistantReply } from '@/engine/assistant';
import type { ChatTurn } from '@/engine/ai';
import { newId } from '@/engine/format';
import { useApp } from '@/store/AppContext';
import { useChat, type ChatMessage } from '@/store/chat';
import { aiFor, inClaudeApp } from '@/ui/host';
import { C, Chip, Muted } from '@/ui/kit';
import { confirmAction, notify } from '@/ui/notify';
import { startEstimateFromChat } from '@/ui/startEstimate';
import { listen, speak, stopSpeaking, voiceInputAvailable } from '@/ui/voice';

const SUGGESTIONS = [
  'Price a 45 SF hall bathroom remodel, tiled shower, mid-grade',
  'Do I need a permit to replace a water heater in Seattle?',
  'How do my bathroom prices compare to my past jobs?',
  'Write a friendly follow-up text for a quote I sent last week',
  'Lên danh sách vật tư cho 300 SF sàn LVP',
];

/** Home: talk with Claude about anything. Voice in, answers read aloud, and estimates started from the chat. */
export default function Assistant() {
  const { profile, presets, pastJobs, estimates, apiKey, setDraft } = useApp();
  const { messages, add, clear, settings, setSettings, current } = useChat();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const stopRef = useRef<{ stop(): void } | null>(null);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const canListen = voiceInputAvailable();
  const claudeOn = inClaudeApp || !!apiKey;

  useEffect(() => () => { stopRef.current?.stop(); stopSpeaking(); }, []);

  const send = async (raw: string, spoken = false) => {
    const q = raw.trim();
    if (!q || busy || !profile) return;
    setText('');
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
      const reply = await aiFor(apiKey).chat(turns, assistantSystem({ profile, presets, pastJobs, estimates }));
      const { text: answer, action } = parseAssistantReply(reply);
      add({ id: newId(), role: 'assistant', text: answer, action });
      if (settings.speak || spoken) speak(answer);
    } catch (e) {
      add({ id: newId(), role: 'assistant', text: e instanceof Error ? e.message : 'Claude could not answer. Try again.', error: true });
    } finally {
      setBusy(false);
    }
  };

  const mic = async () => {
    if (listening) {
      stopRef.current?.stop();
      return;
    }
    if (!canListen) {
      notify('Talk with your keyboard', 'Tap the box, then the microphone on your keyboard, and speak. Voice buttons work in the installed iPhone app.');
      return;
    }
    stopSpeaking();
    setListening(true);
    const handle = await listen(settings.lang, {
      onPartial: setText,
      onFinal: (t) => { setText(t); send(t, true); },
      onError: (m) => notify('Voice', m),
      onEnd: () => { setListening(false); stopRef.current = null; },
    });
    if (!handle) setListening(false);
    stopRef.current = handle;
  };

  const start = async (m: ChatMessage) => {
    if (!m.action) return;
    setStarting(m.id);
    try {
      await startEstimateFromChat(m.action, { apiKey, profile, pastJobs, setDraft });
    } catch {
      notify('Could not start the estimate', 'Try again, or use the New tab.');
    } finally {
      setStarting(null);
    }
  };

  const firstName = (profile?.contactName ?? '').trim().split(/\s+/)[0];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, paddingHorizontal: 12, paddingTop: 4 }}>
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: settings.speak }} accessibilityLabel="Read answers aloud"
          onPress={() => { if (settings.speak) stopSpeaking(); setSettings({ ...settings, speak: !settings.speak }); }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 8 }}>
          <Ionicons name={settings.speak ? 'volume-high' : 'volume-mute'} size={20} color={settings.speak ? C.accent : C.muted} />
          <Text style={{ color: settings.speak ? C.accent : C.muted, fontSize: 13, fontWeight: '600' }}>{settings.speak ? 'Voice on' : 'Voice off'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Voice language"
          onPress={() => setSettings({ ...settings, lang: settings.lang === 'en-US' ? 'vi-VN' : 'en-US' })} style={{ padding: 8 }}>
          <Text style={{ color: C.muted, fontSize: 13, fontWeight: '700' }}>{settings.lang === 'en-US' ? 'EN' : 'VI'}</Text>
        </Pressable>
        {messages.length ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear chat" style={{ padding: 8 }}
            onPress={() => confirmAction('Clear the chat?', 'Your estimates are not affected.', 'Clear', () => { stopSpeaking(); clear(); })}>
            <Ionicons name="trash-outline" size={19} color={C.muted} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        contentContainerStyle={{ padding: 16, gap: 10, width: '100%', maxWidth: 760, alignSelf: 'center', flexGrow: 1 }}>
        {messages.length === 0 ? (
          <View style={{ gap: 12, paddingTop: 24 }}>
            <Text style={{ fontSize: 26, fontWeight: '700', color: C.ink }}>Hi{firstName ? ` ${firstName}` : ''}, what can I help with?</Text>
            <Muted>
              Ask anything: pricing, materials, code and permits, your jobs and numbers, messages to clients. Say a job out loud and I’ll start the estimate.
            </Muted>
            {!claudeOn ? (
              <Text style={{ color: C.warnInk, fontSize: 13 }}>Claude isn’t connected here. Open the app inside Claude, or add your key in Settings.</Text>
            ) : null}
            <View style={{ gap: 8, alignItems: 'flex-start' }}>
              {SUGGESTIONS.map((s) => <Chip key={s} label={s} onPress={() => send(s)} />)}
            </View>
          </View>
        ) : null}

        {messages.map((m) => (
          <View key={m.id} style={{ alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', gap: 6 }}>
            <View style={{
              maxWidth: '88%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10,
              backgroundColor: m.role === 'user' ? C.accent : m.error ? C.warnBg : C.card,
              borderWidth: m.role === 'user' ? 0 : 1, borderColor: C.line,
            }}>
              <Text selectable style={{ color: m.role === 'user' ? '#fff' : m.error ? C.warnInk : C.ink, fontSize: 16, lineHeight: 23 }}>{m.text}</Text>
            </View>
            {m.role === 'assistant' && !m.error ? (
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                {m.action ? (
                  <Pressable accessibilityRole="button" disabled={!!starting} onPress={() => start(m)}
                    style={{ backgroundColor: C.dark, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, opacity: starting ? 0.6 : 1 }}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>
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
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <ActivityIndicator color={C.accent} />
            <Muted>Thinking…</Muted>
          </View>
        ) : null}
      </ScrollView>

      <View style={{ borderTopWidth: 1, borderColor: C.line, backgroundColor: C.bg, padding: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, width: '100%', maxWidth: 740, alignSelf: 'center' }}>
          <Pressable accessibilityRole="button" accessibilityLabel={listening ? 'Stop listening' : 'Talk'} onPress={mic}
            style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: listening ? C.accent : C.card, borderWidth: 1, borderColor: listening ? C.accent : C.line }}>
            <Ionicons name={listening ? 'stop' : 'mic'} size={22} color={listening ? '#fff' : C.ink} />
          </Pressable>
          <TextInput
            value={text} onChangeText={setText} multiline accessibilityLabel="Message"
            placeholder={listening ? 'Listening…' : 'Ask anything, or describe a job'} placeholderTextColor="#8A8F96"
            style={{ flex: 1, minHeight: 46, maxHeight: 140, borderRadius: 23, borderWidth: 1, borderColor: C.line, backgroundColor: C.card,
              paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontSize: 16, color: C.ink }}
          />
          <Pressable accessibilityRole="button" accessibilityLabel="Send" disabled={!text.trim() || busy} onPress={() => send(text)}
            style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: text.trim() && !busy ? C.accent : C.line }}>
            <Ionicons name="arrow-up" size={22} color="#fff" />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
