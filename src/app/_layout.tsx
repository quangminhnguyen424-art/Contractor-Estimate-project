import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppProvider, useApp } from '@/store/AppContext';
import { C } from '@/ui/kit';

function RootStack() {
  const { ready, profile } = useApp();
  if (!ready) {
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
        headerShadowVisible: false,
        headerBackTitle: 'Back',
        contentStyle: { backgroundColor: C.bg },
      }}>
      <Stack.Protected guard={!profile}>
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!!profile}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="questions" options={{ title: 'A few questions' }} />
        <Stack.Screen name="estimate/[id]/index" options={{ title: 'Estimate' }} />
        <Stack.Screen name="estimate/[id]/quote" options={{ title: 'Client quote' }} />
        <Stack.Screen name="estimate/[id]/materials" options={{ title: 'Material list' }} />
        <Stack.Screen name="past-job" options={{ title: 'Past job', presentation: 'modal' }} />
        <Stack.Screen name="price-book" options={{ title: 'Price book' }} />
        <Stack.Screen name="job-type" options={{ title: 'Type of work' }} />
        <Stack.Screen name="floor-plan" options={{ title: 'Floor plan' }} />
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
    add('meta', { name: 'apple-mobile-web-app-title', content: 'Estimator' });
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
        <StatusBar style="dark" />
        <RootStack />
      </AppProvider>
    </SafeAreaProvider>
  );
}
