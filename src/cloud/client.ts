import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type Session } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { CLOUD } from './config';

/** One Supabase client for the whole app; the session is kept on the phone and refreshed while the app is open. */
export const supabase = createClient(CLOUD.url, CLOUD.anonKey, {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (s) => {
    if (s === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

export async function currentSession(): Promise<Session | null> {
  try {
    return (await supabase.auth.getSession()).data.session;
  } catch {
    return null;
  }
}

/** The signed-in user's access token, for the AI proxy (null when signed out). */
export const accessToken = async () => (await currentSession())?.access_token ?? null;

/** Calls one of our server functions as the signed-in user. */
export async function callFunction<T>(name: string, body: unknown): Promise<T> {
  const token = await accessToken();
  if (!token) throw new Error('Sign in to Bidwell cloud first.');
  const res = await fetch(`${CLOUD.url}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}`, apikey: CLOUD.anonKey },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}
