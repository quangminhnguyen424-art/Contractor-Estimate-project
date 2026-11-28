import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, ScrollView, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { CloudProvider, useCloud } from '@/cloud/CloudProvider';
import { useMyPlan } from '@/cloud/usePlan';
import { notify } from '@/ui/notify';
import { PlanPicker } from '@/ui/PlanPicker';
import { cloudConfigured } from '@/cloud/config';
import { initLanguage, setTranslationAI, useLanguage, useT } from '@/i18n';
import { AppProvider, useApp } from '@/store/AppContext';
import { ConfettiHost } from '@/ui/celebrate';
import { aiFor, inClaudeApp } from '@/ui/host';
import { LanguageScreen } from '@/ui/LanguageScreen';
import { LoginScreen } from '@/ui/LoginScreen';
import { SUPPORT_EMAIL } from '@/engine/legal';
import { clearFreshSetup, isWelcomed, markWelcomed } from '@/ui/welcome';
import { Button, C } from '@/ui/kit';
import { SideNav } from '@/ui/web/SideNav';
import { useWide } from '@/ui/wide';
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
      <Text style={{ color: '#FFFFFF', fontSize: 13 }}>Storage is full. Delete old photos or finished jobs, then try again.</Text>
    </View>
  );
}

/** While Studwise translates the app into a language that is not built in: a small note, so mixed screens make sense. */
function TranslationProgress() {
  const { language, progress } = useLanguage();
  const insets = useSafeAreaInsets();
  if (!language || !progress.total || progress.done >= progress.total) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: insets.top + 6, alignSelf: 'center', backgroundColor: C.ink, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7, opacity: 0.92 }}>
      <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}>{`Studwise is learning ${language.name}… ${Math.round((progress.done / progress.total) * 100)}%`}</Text>
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
          <Text style={{ color: C.ink, fontSize: 18, fontWeight: '700', textAlign: 'center' }}>Can’t reach Studwise cloud</Text>
          <Text style={{ color: C.ink2, fontSize: 14, textAlign: 'center' }}>Check your internet connection. Your saved work comes back once it connects.</Text>
          <Button title="Try again" icon="refresh" onPress={cloud.retryFirstSync} style={{ alignSelf: 'stretch' }} />
          <Button kind="ghost" title="Continue offline" onPress={cloud.skipFirstSync} />
        </>
      )}
    </View>
  );
}

/** Once per account on each phone: the welcome video, a walk through setup (filled in from the account), then a quick tour. */
/** Lets the app translate itself into a language that is not built in, once there is an AI to ask. */
function useTranslationAI() {
  const { apiKey } = useApp();
  const cloud = useCloud();
  const can = inClaudeApp || !!apiKey?.trim() || !!cloud.user;
  useEffect(() => {
    // Only the app's own wording is sent, never anything the user typed, so this does not wait for the AI-sharing choice.
    setTranslationAI(can ? (prompt, maxTokens) => aiFor(apiKey, true).complete(prompt, undefined, maxTokens) : null);
    return () => setTranslationAI(null);
  }, [can, apiKey]);
}

/** Screen titles in the header, in the user's language. */
function HeaderTitle({ children }: { children: string }) {
  return <Text numberOfLines={1} style={{ fontWeight: '700', color: C.ink, fontSize: 17 }}>{children}</Text>;
}

/** The page title on a computer screen: larger, like the heading of a web page. */
function WideHeaderTitle({ children }: { children: string }) {
  return <Text numberOfLines={1} style={{ fontWeight: '700', color: C.ink, fontSize: 20, letterSpacing: -0.2 }}>{children}</Text>;
}

function PlanGate({ plan, onChanged }: { plan: Parameters<typeof PlanPicker>[0]['plan']; onChanged: () => void }) {
  const insets = useSafeAreaInsets();
  const cloud = useCloud();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 20, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, gap: 14, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
      <Text style={{ color: C.ink, fontSize: 26, fontWeight: '800', letterSpacing: -0.3 }}>Pick your plan</Text>
      <Text style={{ color: C.ink2, fontSize: 15, lineHeight: 21 }}>Try any plan free for 14 days. Cancel before the trial ends and you pay nothing.</Text>
      <PlanPicker plan={plan} onChanged={onChanged} />
      {/* Never a dead end: someone who doesn't want a plan can still leave or ask for help. */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 28, paddingTop: 6 }}>
        <Text onPress={() => { void cloud.signOut().then((m) => { if (m) notify('Could not log out', m); }); }} style={{ color: C.ink2, fontWeight: '700', padding: 8 }}>Log out</Text>
        <Text onPress={() => { void Linking.openURL(`mailto:${SUPPORT_EMAIL}`); }} style={{ color: C.ink2, fontWeight: '700', padding: 8 }}>Get help</Text>
      </View>
    </ScrollView>
  );
}

function RootStack() {
  const { ready, profile, termsOk } = useApp();
  const cloud = useCloud();
  const lang = useLanguage();
  const t = useT();
  const wide = useWide();
  useTranslationAI();
  useEffect(() => { void initLanguage(); }, []);
  // Inside the Claude app the AI comes from Claude itself, so the account is optional there; everywhere else you log in first.
  const needLogin = cloudConfigured && !inClaudeApp && !cloud.user;
  const in_ = !needLogin;
  const who = cloud.user?.id ?? (inClaudeApp ? 'claude' : 'local');
  const [welcomed, setWelcomed] = useState<Record<string, boolean>>({});
  const [goTo, setGoTo] = useState<string | null>(null);
  const { plan, refresh: refreshPlan } = useMyPlan();
  useEffect(() => {
    if (who in welcomed) return;
    isWelcomed(who).then((v) => setWelcomed((w) => ({ ...w, [who]: v })));
  }, [who, welcomed]);
  // No welcome video or tour any more: once setup is done the app opens straight on Home.
  useEffect(() => {
    if (!termsOk || !profile || welcomed[who] !== false) return;
    markWelcomed(who); clearFreshSetup();
  }, [termsOk, profile, welcomed, who]);
  // After the tour: open what the contractor picked once the app is on screen.
  useEffect(() => {
    if (!goTo) return;
    const t = setTimeout(() => { router.push(goTo as never); setGoTo(null); }, 60);
    return () => clearTimeout(t);
  }, [goTo]);
  if (!ready || !cloud.authReady || !lang.ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }
  // The very first screen: which language? Everything after it, login included, is shown in that language.
  if (!lang.chosen) return <LanguageScreen first onDone={() => {}} />;
  if (needLogin) return <LoginScreen gate />;
  if (cloud.user && cloud.firstSync !== 'done') return <FirstSync />;
  // Once plans are switched on: a new account picks Starter, Pro or Team (card first, 14 days free) before using the app.
  if (cloud.user && termsOk && profile && plan?.plan === 'none') return <PlanGate plan={plan} onChanged={refreshPlan} />;
  // On a computer screen the whole app sits beside a rail of links (ui/web/SideNav); phones keep the tab bar.
  const rail = wide && in_ && termsOk && !!profile;
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: C.bg }}>
    {rail ? <SideNav /> : null}
    <View style={{ flex: 1, minWidth: 0 }}>
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: C.bg },
        headerTintColor: C.ink,
        headerTitleStyle: { fontWeight: '700', color: C.ink },
        headerTitle: wide ? WideHeaderTitle : HeaderTitle,
        headerShadowVisible: wide,
        headerBackTitle: t('Back'),
        contentStyle: { backgroundColor: C.bg },
      }}>
      <Stack.Protected guard={in_ && termsOk && !profile}>
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={in_ && termsOk && !!profile}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="questions" options={{ title: 'Check the details' }} />
        <Stack.Screen name="work" options={{ title: 'Work for this job' }} />
        <Stack.Screen name="receipts" options={{ title: 'Receipts' }} />
        <Stack.Screen name="books" options={{ title: 'Money sheet' }} />
        <Stack.Screen name="job/[id]" options={{ title: 'Job' }} />
        <Stack.Screen name="estimate/[id]/index" options={{ title: 'Price details' }} />
        <Stack.Screen name="estimate/[id]/quote" options={{ title: 'Client quote' }} />
        <Stack.Screen name="estimate/[id]/materials" options={{ title: 'Material list' }} />
        <Stack.Screen name="past-job" options={{ title: 'Past job', presentation: 'modal' }} />
        <Stack.Screen name="price-book" options={{ title: 'Price book' }} />
        <Stack.Screen name="job-type" options={{ title: 'Type of work' }} />
        <Stack.Screen name="floor-plan" options={{ title: 'Floor plan' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="language" options={{ title: 'Language' }} />
        <Stack.Screen name="site/[id]/index" options={{ title: 'Job' }} />
        <Stack.Screen name="pricing" options={{ title: 'My pricing' }} />
        <Stack.Screen name="site/[id]/room/[roomId]" options={{ title: 'Area' }} />
        <Stack.Screen name="site/[id]/photo/[photoId]" options={{ title: 'Photo', gestureEnabled: false }} />
        <Stack.Screen name="site/[id]/log" options={{ title: 'Daily log' }} />
        <Stack.Screen name="site/[id]/share" options={{ title: 'Share' }} />
        <Stack.Screen name="scan" options={{ title: 'Scan 3D' }} />
        <Stack.Screen name="connections" options={{ title: 'Connected apps' }} />
        <Stack.Screen name="adu" options={{ title: 'ADU check page' }} />
        <Stack.Screen name="estimate/[id]/permit" options={{ title: 'Permit guide' }} />
        <Stack.Screen name="plan" options={{ title: 'Your plan' }} />
        <Stack.Screen name="team-accounts" options={{ title: 'Team accounts' }} />
        <Stack.Screen name="event" options={{ title: 'Appointment', presentation: 'modal' }} />
        {/* No swipe-back where a finger draws: a signature is a left-to-right stroke and would close the screen. */}
        <Stack.Screen name="estimate/[id]/sign" options={{ title: 'Client signature', gestureEnabled: false }} />
        <Stack.Screen name="estimate/[id]/contract" options={{ title: 'Contract and payments' }} />
        <Stack.Screen name="estimate/[id]/change" options={{ title: 'Change order', gestureEnabled: false }} />
        <Stack.Screen name="site/[id]/money" options={{ title: 'Costs and receipts' }} />
        <Stack.Screen name="site/[id]/buy" options={{ title: 'Buy list' }} />
        <Stack.Screen name="site/[id]/cost" options={{ title: 'Add a cost', presentation: 'modal' }} />
        <Stack.Screen name="estimate/[id]/follow" options={{ title: 'Follow-ups' }} />
        <Stack.Screen name="team" options={{ title: 'Crew and subs' }} />
        <Stack.Screen name="account" options={{ title: "Account" }} />
        <Stack.Screen name="help" options={{ title: "Help and support" }} />
        <Stack.Screen name="report" options={{ title: "Report a problem" }} />
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
    </View>
    </View>
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
    add('meta', { name: 'apple-mobile-web-app-title', content: 'Studwise AI' });
    add('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'default' });
    add('meta', { name: 'theme-color', content: C.bg });
    // The web app can be served from a sub-folder (WEB_BASE), so icons are found next to it.
    const base = process.env.EXPO_BASE_URL ?? '';
    add('link', { rel: 'apple-touch-icon', href: `${base}/apple-touch-icon.png` });
    add('link', { rel: 'manifest', href: `${base}/manifest.json` });
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
          <TranslationProgress />
          <ConfettiHost />
        </CloudProvider>
      </AppProvider>
    </SafeAreaProvider>
  );
}

/** If a screen crashes: a calm message, try again, or tell support (instead of a white screen). */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  const body = `What I was doing:\n\n\n---\n${error.name}: ${error.message}\n${(error.stack ?? '').split('\n').slice(0, 6).join('\n')}`;
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg, padding: 28, gap: 14 }}>
      <Text style={{ fontSize: 44 }}>🛠️</Text>
      <Text style={{ color: C.ink, fontSize: 22, fontWeight: '700', textAlign: 'center' }}>Something went wrong</Text>
      <Text style={{ color: C.ink2, fontSize: 15, textAlign: 'center' }}>Your work is saved. Try again, and if it keeps happening, send us a report so we can fix it.</Text>
      <Button title="Try again" icon="refresh" onPress={() => { retry(); }} style={{ alignSelf: 'stretch' }} />
      <Button kind="secondary" title="Send a report" icon="mail-outline" style={{ alignSelf: 'stretch' }}
        onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Studwise AI crashed')}&body=${encodeURIComponent(body)}`)} />
    </View>
  );
}
