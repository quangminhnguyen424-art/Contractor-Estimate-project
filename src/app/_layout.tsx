import { Lexend_400Regular } from '@expo-google-fonts/lexend/400Regular';
import { Lexend_500Medium } from '@expo-google-fonts/lexend/500Medium';
import { Lexend_600SemiBold } from '@expo-google-fonts/lexend/600SemiBold';
import { Lexend_700Bold } from '@expo-google-fonts/lexend/700Bold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { CloudProvider } from '@/cloud/CloudProvider';
import { AppProvider, useApp } from '@/store/AppContext';
import { ConfettiHost } from '@/ui/celebrate';
import { C } from '@/ui/kit';
import { FONT, Text } from '@/ui/text';

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

function RootStack() {
  const { ready, profile, termsOk } = useApp();
  const [fontsLoaded, fontError] = useFonts({
    Lexend_400Regular, Lexend_500Medium, Lexend_600SemiBold, Lexend_700Bold,
  });
  // If the font can't load, the app still opens with the phone's own font.
  if (!ready || (!fontsLoaded && !fontError)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: C.bg },
        headerTintColor: C.ink,
        headerTitleStyle: { fontFamily: FONT.bold, color: C.ink },
        headerShadowVisible: false,
        headerBackTitle: 'Back',
        contentStyle: { backgroundColor: C.bg },
      }}>
      <Stack.Protected guard={termsOk && !profile}>
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={termsOk && !!profile}>
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
        <Stack.Screen name="account" options={{ title: 'Bidwell cloud' }} />
      </Stack.Protected>
      {/* Always reachable: on first launch (and after the Terms change) it is the only screen; later it opens from Settings. */}
      <Stack.Screen name="terms" options={{ headerShown: termsOk, title: 'Terms and AI' }} />
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
