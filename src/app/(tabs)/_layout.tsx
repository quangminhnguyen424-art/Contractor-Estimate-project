import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { Platform, Pressable, View, type ColorValue } from 'react-native';

import { C } from '@/ui/kit';
import { Pulse } from '@/ui/motion';
import { FONT } from '@/ui/text';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const icon = (outline: IconName, filled: IconName) =>
  function TabIcon({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) {
    return <Ionicons name={focused ? filled : outline} color={typeof color === 'string' ? color : C.muted} size={size} />;
  };

/** The raised yellow + in the middle of the tab bar: opens the quick menu (estimate, job photo, scan, appointment). */
function PlusButton() {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Quick add" onPress={() => router.push('/quick')} style={{ marginTop: -18 }}>
        <Pulse min={0.97} max={1.04}>
          <View style={{ width: 52, height: 52, transform: [{ rotate: '45deg' }], backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: C.bg,
            shadowColor: C.accent, shadowOpacity: 0.6, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 6 }}>
            <View style={{ transform: [{ rotate: '-45deg' }] }}><Ionicons name="add" size={30} color={C.onAccent} /></View>
          </View>
        </Pulse>
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: C.bg },
        headerShadowVisible: false,
        headerTintColor: C.ink,
        headerTitleStyle: { fontFamily: FONT.bold, fontSize: 18 },
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.muted,
        tabBarLabelStyle: { fontFamily: FONT.semibold, fontSize: 12 },
        tabBarStyle: { backgroundColor: C.card, borderTopColor: C.line, height: Platform.OS === 'web' ? 64 : undefined, paddingTop: 4 },
        sceneStyle: { backgroundColor: C.bg },
        headerRight: () => (
          <Pressable accessibilityRole="button" accessibilityLabel="Settings" onPress={() => router.push('/settings')} hitSlop={10} style={{ paddingHorizontal: 16 }}>
            <Ionicons name="settings-outline" size={22} color={C.ink} />
          </Pressable>
        ),
      }}>
      <Tabs.Screen name="index" options={{ title: 'Bidwell AI', tabBarLabel: 'Home', tabBarIcon: icon('home-outline', 'home') }} />
      <Tabs.Screen name="jobs" options={{ title: 'Estimates', tabBarLabel: 'Estimates', tabBarIcon: icon('document-text-outline', 'document-text') }} />
      <Tabs.Screen name="new" options={{ title: 'New estimate', tabBarLabel: '', tabBarButton: () => <PlusButton /> }} />
      <Tabs.Screen name="sites" options={{ title: 'Job sites', tabBarLabel: 'Job Site', tabBarIcon: icon('construct-outline', 'construct') }} />
      <Tabs.Screen name="schedule" options={{ title: 'Schedule', tabBarIcon: icon('calendar-outline', 'calendar') }} />
      <Tabs.Screen name="pricing" options={{ title: 'My pricing', href: null }} />
    </Tabs>
  );
}
