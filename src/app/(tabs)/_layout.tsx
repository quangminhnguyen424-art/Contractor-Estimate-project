import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, useWindowDimensions, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandMark } from '@/ui/BrandMark';
import { C } from '@/ui/kit';
import { Text } from '@/ui/text';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const icon = (outline: IconName, filled: IconName) =>
  function TabIcon({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) {
    return <Ionicons name={focused ? filled : outline} color={typeof color === 'string' ? color : C.muted} size={size} />;
  };

/** The orange + in the middle of the tab bar: a new estimate, the one thing the app is for. */
function PlusButton() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Pressable accessibilityRole="button" accessibilityLabel="New estimate" onPress={() => router.push('/new')} hitSlop={6}
        style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 24, backgroundColor: C.orange, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

const TABS: Record<string, { label: string; icon: IconName; active: IconName }> = {
  index: { label: 'Home', icon: 'home-outline', active: 'home' },
  jobs: { label: 'Jobs', icon: 'briefcase-outline', active: 'briefcase' },
  schedule: { label: 'Schedule', icon: 'calendar-outline', active: 'calendar' },
  me: { label: 'Me', icon: 'person-outline', active: 'person' },
};

/** A plain tab bar on the page itself: a hairline above, dark ink for the open tab, the orange + in the middle. */
function FloatingTabBar({ state, navigateToTab }: { state: { index: number; routes: { key: string; name: string }[] }; navigateToTab: (key: string) => void }) {
  const insets = useSafeAreaInsets();
  const current = state.routes[state.index]?.name;
  return (
    <View style={{ backgroundColor: C.bg, borderTopWidth: StyleSheet.hairlineWidth, borderColor: C.line, paddingBottom: Math.max(insets.bottom, 6) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', height: 58, width: '100%', maxWidth: 520, alignSelf: 'center' }}>
        {state.routes.map((r) => {
          if (r.name === 'new') return <PlusButton key={r.key} />;
          const t = TABS[r.name];
          if (!t) return null;
          const on = current === r.name;
          return (
            <Pressable key={r.key} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={t.label}
              onPress={() => navigateToTab(r.key)} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', height: 58, gap: 3 }}>
              <Ionicons name={on ? t.active : t.icon} size={23} color={on ? C.ink : '#8791A1'} />
              <Text style={{ fontSize: 11, fontWeight: on ? '600' : '500', color: on ? C.ink : C.muted }} numberOfLines={1}>{t.label}</Text>
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
    <View style={{ width: 248, backgroundColor: C.panel, paddingHorizontal: 16, paddingTop: 22, paddingBottom: 18, gap: 6 }}>
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
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, height: 44, borderRadius: 12, paddingHorizontal: 12, backgroundColor: on ? C.card : 'transparent' }}>
            <Ionicons name={on ? t.active : t.icon} size={22} color={on ? C.ink : C.ink2} />
            <Text style={{ fontSize: 15, fontWeight: on ? '600' : '400', color: C.ink }}>{t.label}</Text>
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
        headerTitleStyle: { fontWeight: '600', fontSize: 17 },
        headerTitle: ({ children }) => <Text numberOfLines={1} style={{ fontWeight: '600', fontSize: 17, color: C.ink }}>{children}</Text>,
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.muted,
        tabBarLabelStyle: { fontWeight: '600', fontSize: 12 },
        sceneStyle: { backgroundColor: C.bg },
        headerRight: wide ? () => null : () => (
          <View style={{ flexDirection: 'row' }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Help and support" onPress={() => router.push('/help')} hitSlop={10} style={{ paddingHorizontal: 16 }}>
            <Ionicons name="help-circle-outline" size={23} color={C.ink2} />
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
