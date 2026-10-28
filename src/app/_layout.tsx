import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
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
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="dark" />
        <RootStack />
      </AppProvider>
    </SafeAreaProvider>
  );
}
