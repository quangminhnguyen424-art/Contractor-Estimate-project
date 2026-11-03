import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { Pressable, type ColorValue } from 'react-native';

import { C } from '@/ui/kit';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const icon = (name: IconName) =>
  function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} color={typeof color === 'string' ? color : C.muted} size={size} />;
  };

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: C.bg },
        headerShadowVisible: false,
        headerTintColor: C.ink,
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.muted,
        tabBarStyle: { backgroundColor: C.card, borderTopColor: C.line },
        sceneStyle: { backgroundColor: C.bg },
        // Settings lives behind the gear on every tab, to keep the tab bar to five.
        headerRight: () => (
          <Pressable accessibilityRole="button" accessibilityLabel="Settings" onPress={() => router.push('/settings')} hitSlop={10} style={{ paddingHorizontal: 16 }}>
            <Ionicons name="settings-outline" size={22} color={C.ink} />
          </Pressable>
        ),
      }}>
      <Tabs.Screen name="index" options={{ title: 'Assistant', tabBarLabel: 'Assistant', tabBarIcon: icon('chatbubbles-outline') }} />
      <Tabs.Screen name="jobs" options={{ title: 'Jobs', tabBarIcon: icon('list') }} />
      <Tabs.Screen name="new" options={{ title: 'New estimate', tabBarLabel: 'New', tabBarIcon: icon('add-circle-outline') }} />
      <Tabs.Screen name="sites" options={{ title: 'Job sites', tabBarLabel: 'Job Site', tabBarIcon: icon('construct-outline') }} />
      <Tabs.Screen name="pricing" options={{ title: 'My pricing', tabBarLabel: 'Pricing', tabBarIcon: icon('pricetags-outline') }} />
    </Tabs>
  );
}
