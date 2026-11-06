import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { CloudProvider, useCloud } from '@/cloud/CloudProvider';
import { cloudConfigured } from '@/cloud/config';
import { AppProvider, useApp } from '@/store/AppContext';
import { ConfettiHost } from '@/ui/celebrate';
import { inClaudeApp } from '@/ui/host';
import { LoginScreen } from '@/ui/LoginScreen';
import { IntroVideo } from '@/ui/IntroVideo';
import { Onboarding } from '@/ui/Onboarding';
import { QuickTour } from '@/ui/QuickTour';
import { clearFreshSetup, isFreshSetup, isWelcomed, markWelcomed } from '@/ui/welcome';
import { Button, C } from '@/ui/kit';
import { Text } from '@/ui/text';

/** Shown on every screen when the app could not save (storage full), so no change is lost silently. */
function SaveWarning() {
  const { saveFailed } = useApp();
  const insets = useSafeAreaInsets();
  if (!saveFailed) return null;
  return (
    <View accessibilityRole="alert" pointerEvents="none"
      style={{ position: 'absolute', left: 12, right: 12, bottom: insets.bottom + 64, backgroundColor: '#B42318', borderRadius: 14, padding: 12 }}>
      <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Could not save your latest changes</Text>
      <Text style={{ color: '#FFFFFF', fontSize: 13 }}>Storage is full. Delete old photos or finished job sites, then try again.</Text>
    </View>
  );
}

/** After signing in on a phone: bring the account's work down before deciding whether setup is needed. */
function FirstSync() {
  const cloud = useCloud();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg, padding: 24, gap: 14 }}>
      {cloud.firstSync === 'waiting' ? (
        <>
          <ActivityIndicator color={C.accent} />
          <Text style={{ color: C.ink2, fontSize: 15 }}>Loading your account…</Text>
        </>
      ) : (
        <>
          <Text style={{ color: C.ink, fontSize: 18, fontWeight: '700', textAlign: 'center' }}>Can’t reach Bidwell cloud</Text>
          <Text style={{ color: C.ink2, fontSize: 14, textAlign: 'center' }}>Check your internet connection. Your saved work comes back once it connects.</Text>
          <Button title="Try again" icon="refresh" onPress={cloud.retryFirstSync} style={{ alignSelf: 'stretch' }} />
          <Button kind="ghost" title="Continue offline" onPress={cloud.skipFirstSync} />
        </>
      )}
    </View>
  );
}

/** Once per account on each phone: the welcome video, a walk through setup (filled in from the account), then a quick tour. */
function Welcome({ onDone }: { onDone: (route?: string) => void }) {
  const { profile } = useApp();
  // Right after a brand-new setup, only the tour is left.
  const [step, setStep] = useState<'intro' | 'setup' | 'tour'>(() => (isFreshSetup() ? 'tour' : 'intro'));
  if (step === 'intro') return <IntroVideo onDone={() => setStep('setup')} />;
  if (step === 'setup') return <Onboarding skipIntro onDone={() => setStep('tour')} />;
  return <QuickTour name={profile?.contactName?.split(' ')[0]} onDone={onDone} />;
}

function RootStack() {
  const { ready, profile, termsOk } = useApp();
  const cloud = useCloud();
  // Inside the Claude app the AI comes from Claude itself, so the account is optional there; everywhere else you log in first.
  const needLogin = cloudConfigured && !inClaudeApp && !cloud.user;
  const in_ = !needLogin;
  const who = cloud.user?.id ?? (inClaudeApp ? 'claude' : 'local');
  const [welcomed, setWelcomed] = useState<Record<string, boolean>>({});
  const [goTo, setGoTo] = useState<string | null>(null);
  useEffect(() => {
    if (who in welcomed) return;
    isWelcomed(who).then((v) => setWelcomed((w) => ({ ...w, [who]: v })));
  }, [who, welcomed]);
  // After the tour: open what the contractor picked once the app is on screen.
  useEffect(() => {
    if (!goTo) return;
    const t = setTimeout(() => { router.push(goTo as never); setGoTo(null); }, 60);
    return () => clearTimeout(t);
  }, [goTo]);
  if (!ready || !cloud.authReady) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }
  if (needLogin) return <LoginScreen gate />;
  if (cloud.user && cloud.firstSync !== 'done') return <FirstSync />;
  if (termsOk && profile && welcomed[who] === false) {
    return <Welcome onDone={(route) => {
      markWelcomed(who); clearFreshSetup();
      setWelcomed((w) => ({ ...w, [who]: true }));
      if (route) setGoTo(route);
    }} />;
  }
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: C.bg },
        headerTintColor: C.ink,
        headerTitleStyle: { fontWeight: '700', color: C.ink },
        headerShadowVisible: false,
        headerBackTitle: 'Back',
        contentStyle: { backgroundColor: C.bg },
      }}>
      <Stack.Protected guard={in_ && termsOk && !profile}>
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={in_ && termsOk && !!profile}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="questions" options={{ title: 'A few questions' }} />
        <Stack.Screen name="estimate/[id]/index" options={{ title: 'Estimate' }} />
        <Stack.Screen name="estimate/[id]/quote" options={{ title: 'Client quote' }} />
        <Stack.Screen name="estimate/[id]/materials" options={{ title: 'Material list' }} />
        <Stack.Screen name="past-job" options={{ title: 'Past job', presentation: 'modal' }} />
        <Stack.Screen name="price-book" options={{ title: 'Price book' }} />
        <Stack.Screen name="job-type" options={{ title: 'Type of work' }} />
        <Stack.Screen name="floor-plan" options={{ title: 'Floor plan' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="site/[id]/index" options={{ title: 'Job site' }} />
        <Stack.Screen name="site/[id]/room/[roomId]" options={{ title: 'Room' }} />
        <Stack.Screen name="site/[id]/photo/[photoId]" options={{ title: 'Photo' }} />
        <Stack.Screen name="site/[id]/log" options={{ title: 'Daily log' }} />
        <Stack.Screen name="site/[id]/share" options={{ title: 'Share' }} />
        <Stack.Screen name="scan" options={{ title: 'Scan 3D' }} />
        <Stack.Screen name="connections" options={{ title: 'Connected apps' }} />
        <Stack.Screen name="event" options={{ title: 'Appointment', presentation: 'modal' }} />
        <Stack.Screen name="quick" options={{ headerShown: false, presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }} />
        <Stack.Screen name="estimate/[id]/sign" options={{ title: 'Client signature' }} />
        <Stack.Screen name="estimate/[id]/contract" options={{ title: 'Contract & payments' }} />
        <Stack.Screen name="estimate/[id]/change" options={{ title: 'Change order' }} />
        <Stack.Screen name="site/[id]/money" options={{ title: 'Job money' }} />
        <Stack.Screen name="site/[id]/buy" options={{ title: 'Buy list' }} />
        <Stack.Screen name="site/[id]/cost" options={{ title: 'Add a cost', presentation: 'modal' }} />
        <Stack.Screen name="estimate/[id]/follow" options={{ title: 'Follow-ups' }} />
        <Stack.Screen name="team" options={{ title: 'Crew & subs' }} />
        <Stack.Screen name="account" options={{ title: "Account" }} />
      </Stack.Protected>
      {/* After logging in: on first launch (and after the Terms change) it is the only screen; later it opens from Settings. */}
      <Stack.Protected guard={in_}>
        <Stack.Screen name="terms" options={{ headerShown: termsOk, title: 'Terms and AI' }} />
      </Stack.Protected>
      {/* Logging in from inside the app (e.g. to send a signing link): opens as a pop-up. Logged out, the app shows the login screen instead of all of this. */}
      <Stack.Protected guard={in_ && termsOk && !!profile && !cloud.user}>
        <Stack.Screen name="login" options={{ headerShown: false, presentation: 'modal' }} />
      </Stack.Protected>
    </Stack>
  );
}

/** On the web, make "Add to Home Screen" on iPhone open the app full screen with its own icon. */
function useHomeScreenTags() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const add = (tag: 'meta' | 'link', attrs: Record<string, string>) => {
      const key = attrs.name ?? attrs.rel;
      if (document.head.querySelector(`${tag}[${attrs.name ? 'name' : 'rel'}="${key}"]`)) return;
      const el = document.createElement(tag);
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      document.head.appendChild(el);
    };
    add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
    add('meta', { name: 'mobile-web-app-capable', content: 'yes' });
    add('meta', { name: 'apple-mobile-web-app-title', content: 'Bidwell AI' });
    add('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'default' });
    add('meta', { name: 'theme-color', content: C.bg });
    add('link', { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' });
    add('link', { rel: 'manifest', href: '/manifest.json' });
  }, []);
}

export default function RootLayout() {
  useHomeScreenTags();
  return (
    <SafeAreaProvider>
      <AppProvider>
        <CloudProvider>
          <StatusBar style="dark" />
          <RootStack />
          <SaveWarning />
          <ConfettiHost />
        </CloudProvider>
      </AppProvider>
    </SafeAreaProvider>
  );
}
