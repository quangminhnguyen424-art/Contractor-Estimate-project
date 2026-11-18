import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { Pressable, useWindowDimensions, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandMark } from '@/ui/BrandMark';
import { C } from '@/ui/kit';
import { Pulse } from '@/ui/motion';
import { Text } from '@/ui/text';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const icon = (outline: IconName, filled: IconName) =>
  function TabIcon({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) {
    return <Ionicons name={focused ? filled : outline} color={typeof color === 'string' ? color : C.muted} size={size} />;
  };

/** The raised orange + in the middle of the tab bar: a new estimate, the one thing the app is for. */
function PlusButton() {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Pressable accessibilityRole="button" accessibilityLabel="New estimate" onPress={() => router.push('/new')} style={{ marginTop: -22 }}>
        <Pulse min={0.97} max={1.04}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: C.orange, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: C.card,
            shadowColor: C.orange, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 }}>
            <Ionicons name="add" size={30} color="#FFFFFF" />
          </View>
        </Pulse>
      </Pressable>
    </View>
  );
}

const TABS: Record<string, { label: string; icon: IconName; active: IconName }> = {
  index: { label: 'Home', icon: 'home-outline', active: 'home' },
  jobs: { label: 'Jobs', icon: 'briefcase-outline', active: 'briefcase' },
  schedule: { label: 'Schedule', icon: 'calendar-outline', active: 'calendar' },
  me: { label: 'Me', icon: 'person-circle-outline', active: 'person-circle' },
};

/** Floating tab bar like Facebook's: a rounded bar lifted off the bottom edge, the open tab in a soft blue pill, the orange + in the middle. */
function FloatingTabBar({ state, navigateToTab }: { state: { index: number; routes: { key: string; name: string }[] }; navigateToTab: (key: string) => void }) {
  const insets = useSafeAreaInsets();
  const current = state.routes[state.index]?.name;
  return (
    <View style={{ backgroundColor: C.bg, paddingHorizontal: 14, paddingTop: 6, paddingBottom: Math.max(insets.bottom, 10) + 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 32, height: 64, paddingHorizontal: 6, width: '100%', maxWidth: 520, alignSelf: 'center',
        borderWidth: 1, borderColor: C.line, shadowColor: '#0B1324', shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6 }}>
        {state.routes.map((r) => {
          if (r.name === 'new') return <PlusButton key={r.key} />;
          const t = TABS[r.name];
          if (!t) return null;
          const on = current === r.name;
          return (
            <Pressable key={r.key} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={t.label}
              onPress={() => navigateToTab(r.key)} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', height: 64 }}>
              <View style={{ alignItems: 'center', justifyContent: 'center', width: 58, height: 40, borderRadius: 20, backgroundColor: on ? C.accentTint : 'transparent' }}>
                <Ionicons name={on ? t.active : t.icon} size={24} color={on ? C.accent : C.ink2} />
              </View>
              <Text style={{ fontSize: 10, fontWeight: on ? '700' : '500', color: on ? C.accent : C.muted, marginTop: 1 }} numberOfLines={1}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Wide screens (a computer's browser): a left sidebar with labels and a big New estimate button, like a web app. */
const WIDE = 960;

function SideBar({ state, navigateToTab }: { state: { index: number; routes: { key: string; name: string }[] }; navigateToTab: (key: string) => void }) {
  const current = state.routes[state.index]?.name;
  return (
    <View style={{ width: 248, backgroundColor: C.card, borderRightWidth: 1, borderColor: C.line, paddingHorizontal: 16, paddingTop: 22, paddingBottom: 18, gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 6, marginBottom: 14 }}>
        <BrandMark size={34} />
        <Text style={{ fontSize: 19, fontWeight: '800', color: C.ink, letterSpacing: -0.3 }}>Studwise AI</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="New estimate" onPress={() => router.push('/new')}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.orange, borderRadius: 14, height: 46, marginBottom: 12 }}>
        <Ionicons name="add" size={22} color="#FFFFFF" />
        <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>New estimate</Text>
      </Pressable>
      {state.routes.map((r) => {
        const t = TABS[r.name];
        if (!t) return null;
        const on = current === r.name;
        return (
          <Pressable key={r.key} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={t.label} onPress={() => navigateToTab(r.key)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, height: 44, borderRadius: 12, paddingHorizontal: 12, backgroundColor: on ? C.accentTint : 'transparent' }}>
            <Ionicons name={on ? t.active : t.icon} size={22} color={on ? C.accent : C.ink2} />
            <Text style={{ fontSize: 15, fontWeight: on ? '700' : '500', color: on ? C.accent : C.ink }}>{t.label}</Text>
          </Pressable>
        );
      })}
      <View style={{ flex: 1 }} />
      <Pressable accessibilityRole="button" accessibilityLabel="Help and support" onPress={() => router.push('/help')}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, height: 44, borderRadius: 12, paddingHorizontal: 12 }}>
        <Ionicons name="help-circle-outline" size={22} color={C.ink2} />
        <Text style={{ fontSize: 15, color: C.ink }}>Help and support</Text>
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  const wide = useWindowDimensions().width >= WIDE;
  return (
    <Tabs
      tabBar={(props) => (wide ? <SideBar state={props.state} navigateToTab={props.navigateToTab} /> : <FloatingTabBar state={props.state} navigateToTab={props.navigateToTab} />)}
      screenOptions={{
        tabBarPosition: wide ? 'left' : 'bottom',
        headerStyle: { backgroundColor: C.bg },
        headerShadowVisible: false,
        headerTintColor: C.ink,
        headerTitleStyle: { fontWeight: '700', fontSize: 18 },
        headerTitle: ({ children }) => <Text numberOfLines={1} style={{ fontWeight: '700', fontSize: 18, color: C.ink }}>{children}</Text>,
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.muted,
        tabBarLabelStyle: { fontWeight: '600', fontSize: 12 },
        sceneStyle: { backgroundColor: C.bg },
        headerRight: wide ? () => null : () => (
          <View style={{ flexDirection: 'row' }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Help and support" onPress={() => router.push('/help')} hitSlop={10} style={{ paddingHorizontal: 16 }}>
            <Ionicons name="help-circle-outline" size={24} color={C.ink} />
          </Pressable>
          </View>
        ),
      }}>
      <Tabs.Screen name="index" options={{ title: 'Studwise AI', tabBarLabel: 'Home', tabBarIcon: icon('home-outline', 'home') }} />
      <Tabs.Screen name="jobs" options={{ title: 'Jobs', tabBarLabel: 'Jobs', tabBarIcon: icon('briefcase-outline', 'briefcase') }} />
      <Tabs.Screen name="new" options={{ title: 'New estimate', tabBarLabel: '', tabBarButton: () => <PlusButton /> }} />
      <Tabs.Screen name="schedule" options={{ title: 'Schedule', tabBarIcon: icon('calendar-outline', 'calendar') }} />
      <Tabs.Screen name="me" options={{ title: 'Me', headerRight: () => null }} />
    </Tabs>
  );
}
