import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { EstimateAction } from '@/engine/assistant';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  action?: EstimateAction;
  error?: boolean;
}

const KEY = 'estimating-app/chat';
const SETTINGS_KEY = 'estimating-app/chat-settings';
const MAX = 80;

export interface ChatSettings {
  speak: boolean; // read answers aloud
  lang: 'en-US' | 'vi-VN'; // voice input language
}

/** The assistant conversation, kept on this device only (not in backups). */
export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [settings, setSettingsState] = useState<ChatSettings>({ speak: false, lang: 'en-US' });
  const ref = useRef<ChatMessage[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        const list = raw ? (JSON.parse(raw) as unknown) : [];
        if (Array.isArray(list)) {
          const ok = list.filter((m): m is ChatMessage => !!m && typeof m === 'object' && typeof m.id === 'string'
            && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string');
          ref.current = ok;
          setMessages(ok);
        }
        const s = await AsyncStorage.getItem(SETTINGS_KEY);
        if (s) {
          const v = JSON.parse(s) as Partial<ChatSettings>;
          setSettingsState({ speak: v.speak === true, lang: v.lang === 'vi-VN' ? 'vi-VN' : 'en-US' });
        }
      } catch {
        // Start with an empty chat.
      }
    })();
  }, []);

  const save = useCallback((next: ChatMessage[]) => {
    const trimmed = next.slice(-MAX);
    ref.current = trimmed;
    setMessages(trimmed);
    AsyncStorage.setItem(KEY, JSON.stringify(trimmed)).catch(() => {});
  }, []);

  const add = useCallback((m: ChatMessage) => save([...ref.current, m]), [save]);
  const clear = useCallback(() => save([]), [save]);
  const setSettings = useCallback((s: ChatSettings) => {
    setSettingsState(s);
    AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(s)).catch(() => {});
  }, []);

  return { messages, add, clear, settings, setSettings, current: ref };
}
