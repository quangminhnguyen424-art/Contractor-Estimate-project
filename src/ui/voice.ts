import * as Speech from 'expo-speech';
import { Platform } from 'react-native';

import { isVietnamese, speakable } from '@/engine/assistant';

/**
 * Voice in (speech to text) and voice over (reading answers aloud).
 * Speech recognition needs the installed app (iPhone/Android) or a browser that supports it; where it
 * isn't available, the keyboard's own microphone still works for talking instead of typing.
 */
type Sub = { remove(): void };
interface RecognitionModule {
  isRecognitionAvailable(): boolean;
  requestPermissionsAsync(): Promise<{ granted: boolean }>;
  start(o: { lang: string; interimResults: boolean; continuous: boolean; addsPunctuation?: boolean }): void;
  stop(): void;
  abort(): void;
  addListener(event: 'result', fn: (e: { isFinal: boolean; results: { transcript: string }[] }) => void): Sub;
  addListener(event: 'error', fn: (e: { error: string; message: string }) => void): Sub;
  addListener(event: 'end', fn: () => void): Sub;
}

let cached: RecognitionModule | null | undefined;
function recognition(): RecognitionModule | null {
  if (cached !== undefined) return cached;
  try {
    // Throws in Expo Go and older builds that don't include the native module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = (require('expo-speech-recognition') as { ExpoSpeechRecognitionModule: RecognitionModule }).ExpoSpeechRecognitionModule;
  } catch {
    cached = null;
  }
  return cached;
}

export function voiceInputAvailable(): boolean {
  try {
    return !!recognition()?.isRecognitionAvailable();
  } catch {
    return false;
  }
}

export type VoiceLang = 'en-US' | 'vi-VN';

/** Listens once. Partial words stream to onPartial; the finished sentence goes to onFinal. */
export async function listen(lang: VoiceLang, h: {
  onPartial: (text: string) => void; onFinal: (text: string) => void; onError: (message: string) => void; onEnd: () => void;
}): Promise<{ stop(): void } | null> {
  const mod = recognition();
  if (!mod) return null;
  try {
    const perm = await mod.requestPermissionsAsync();
    if (!perm.granted) {
      h.onError('Microphone access is off. Allow it in Settings, or use the microphone on your keyboard.');
      return null;
    }
  } catch {
    h.onError('Microphone is not available here. Use the microphone on your keyboard.');
    return null;
  }
  let latest = '';
  let done = false;
  const subs: Sub[] = [];
  const finish = () => {
    if (done) return;
    done = true;
    subs.forEach((s) => s.remove());
    if (latest.trim()) h.onFinal(latest.trim());
    h.onEnd();
  };
  subs.push(mod.addListener('result', (e) => {
    latest = e.results[0]?.transcript ?? latest;
    if (e.isFinal) finish();
    else h.onPartial(latest);
  }));
  subs.push(mod.addListener('error', (e) => {
    if (e.error !== 'aborted' && e.error !== 'no-speech') {
      h.onError(e.error === 'not-allowed' || e.error === 'service-not-allowed'
        ? 'Microphone access is blocked here. Use the microphone on your keyboard instead.'
        : 'Could not hear that. Try again, or use the microphone on your keyboard.');
    }
    latest = e.error === 'no-speech' ? '' : latest;
    finish();
  }));
  subs.push(mod.addListener('end', finish));
  try {
    mod.start({ lang, interimResults: true, continuous: false, addsPunctuation: true });
  } catch {
    finish();
    h.onError('Could not start listening. Use the microphone on your keyboard.');
    return null;
  }
  return { stop: () => { try { mod.stop(); } catch { finish(); } } };
}

/** Reads text aloud in English or Vietnamese (picked from the text itself). */
export function speak(text: string) {
  const words = speakable(text);
  if (!words) return;
  try {
    Speech.stop();
    Speech.speak(words, { language: isVietnamese(words) ? 'vi-VN' : 'en-US', rate: Platform.OS === 'ios' ? 0.52 : 1 });
  } catch {
    // No voice available on this device: the answer is still on screen.
  }
}

export function stopSpeaking() {
  try {
    Speech.stop();
  } catch {
    // nothing to stop
  }
}
