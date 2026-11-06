import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCloud } from '@/cloud/CloudProvider';
import { PUBLISHER } from '@/engine/legal';
import { Banner, Button, C, Field } from './kit';
import { Text } from './text';

type Mode = 'in' | 'up' | 'forgot';
const okEmail = (e: string) => /^\S+@\S+\.\S+$/.test(e.trim());

/** The front door: log in, make an account, or reset a forgotten password. Also opens as a pop-up wherever the app needs you signed in. */
/** `gate`: shown on its own before the app (no navigator yet), so there is nothing to close or go back to. */
export function LoginScreen({ gate }: { gate?: boolean }) {
  const cloud = useCloud();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'warn' | 'ok' | 'info'; text: string } | null>(null);

  // Opened as a pop-up: close it once signed in, back to where the contractor was.
  useEffect(() => {
    if (!gate && cloud.user && router.canGoBack()) router.back();
  }, [cloud.user, gate]);

  const go = (m: Mode) => { setMode(m); setMsg(null); setPassword(''); setConfirm(''); };

  const submit = async () => {
    setMsg(null);
    if (!okEmail(email)) { setMsg({ tone: 'warn', text: 'Enter a valid email address.' }); return; }
    if (mode === 'forgot') {
      setBusy(true);
      const err = await cloud.resetPassword(email);
      setBusy(false);
      setMsg(err ? { tone: 'warn', text: err } : { tone: 'ok', text: `If ${email.trim()} has an account, a link to choose a new password is on its way. Check your inbox and spam folder.` });
      return;
    }
    if (password.length < 8) { setMsg({ tone: 'warn', text: 'The password needs at least 8 characters.' }); return; }
    if (mode === 'up' && password !== confirm) { setMsg({ tone: 'warn', text: 'The two passwords don’t match.' }); return; }
    setBusy(true);
    const err = mode === 'in' ? await cloud.signIn(email, password) : await cloud.signUp(email, password);
    setBusy(false);
    if (err) setMsg({ tone: /confirm/i.test(err) ? 'info' : 'warn', text: err });
  };

  const title = mode === 'in' ? 'Log in' : mode === 'up' ? 'Create your account' : 'Forgot your password?';
  const cta = busy ? 'One moment…' : mode === 'in' ? 'Log in' : mode === 'up' ? 'Create account' : 'Send reset link';

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, padding: 20, paddingTop: insets.top + 36, paddingBottom: insets.bottom + 24, gap: 16, width: '100%', maxWidth: 480, alignSelf: 'center' }}>
        {!gate && router.canGoBack() ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} hitSlop={12}
            style={{ position: 'absolute', top: insets.top + 8, right: 16, padding: 6 }}>
            <Ionicons name="close" size={26} color={C.ink2} />
          </Pressable>
        ) : null}

        <View style={{ alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <View style={{ width: 72, height: 72, borderRadius: 22, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center',
            shadowColor: C.accent, shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6 }}>
            <Ionicons name="home" size={36} color="#FFFFFF" />
          </View>
          <Text style={{ color: C.ink, fontSize: 28, fontWeight: '700', letterSpacing: -0.5 }}>Bidwell AI</Text>
          <Text style={{ color: C.muted, fontSize: 14, textAlign: 'center' }}>Estimates, job sites and clients, all in one place.</Text>
        </View>

        <View style={{ backgroundColor: C.card, borderRadius: 22, padding: 18, gap: 14, borderWidth: 1, borderColor: C.line }}>
          <Text style={{ color: C.ink, fontSize: 20, fontWeight: '700' }}>{title}</Text>
          {mode === 'forgot' ? (
            <Text style={{ color: C.ink2, fontSize: 14, lineHeight: 20 }}>Enter the email you signed up with. We’ll email you a link to choose a new password.</Text>
          ) : null}
          <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
            autoComplete="email" textContentType="emailAddress" maxLength={120} returnKeyType={mode === 'forgot' ? 'send' : 'next'}
            onSubmitEditing={mode === 'forgot' ? submit : undefined} />
          {mode !== 'forgot' ? (
            <>
              <Field label={mode === 'up' ? 'Password (8 or more characters)' : 'Password'} value={password} onChangeText={setPassword}
                secureTextEntry={!show} autoCapitalize="none" autoCorrect={false} maxLength={72}
                autoComplete={mode === 'up' ? 'new-password' : 'current-password'} textContentType={mode === 'up' ? 'newPassword' : 'password'}
                returnKeyType={mode === 'in' ? 'go' : 'next'} onSubmitEditing={mode === 'in' ? submit : undefined} />
              {mode === 'up' ? (
                <Field label="Type the password again" value={confirm} onChangeText={setConfirm} secureTextEntry={!show} autoCapitalize="none"
                  autoCorrect={false} maxLength={72} autoComplete="new-password" textContentType="newPassword" returnKeyType="go" onSubmitEditing={submit} />
              ) : null}
              <Pressable accessibilityRole="button" onPress={() => setShow((v) => !v)} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}>
                <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={18} color={C.ink2} />
                <Text style={{ color: C.ink2, fontSize: 14 }}>{show ? 'Hide password' : 'Show password'}</Text>
              </Pressable>
            </>
          ) : null}
          {msg ? <Banner tone={msg.tone} title={msg.text} /> : null}
          <Button title={cta} icon={mode === 'forgot' ? 'mail-outline' : 'arrow-forward'} disabled={busy} onPress={submit} />
          {mode === 'in' ? (
            <Pressable accessibilityRole="button" onPress={() => go('forgot')} hitSlop={8} style={{ alignSelf: 'center', paddingVertical: 4 }}>
              <Text style={{ color: C.accent, fontSize: 15, fontWeight: '600' }}>Forgot password?</Text>
            </Pressable>
          ) : null}
        </View>

        {mode === 'in' ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: C.line }} />
              <Text style={{ color: C.muted, fontSize: 13 }}>New to Bidwell?</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: C.line }} />
            </View>
            <Button kind="secondary" title="Create new account" icon="person-add-outline" onPress={() => go('up')} />
          </>
        ) : (
          <Button kind="ghost" title="Back to log in" icon="arrow-back" onPress={() => go('in')} />
        )}

        <View style={{ flex: 1 }} />
        <Text style={{ color: C.muted, fontSize: 12, textAlign: 'center', lineHeight: 18 }}>
          Your account keeps your work backed up, turns on Bidwell’s AI, and lets clients sign online. Next you’ll review the Terms of Use and AI notice.{'\n'}{PUBLISHER.split(',')[0]}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
