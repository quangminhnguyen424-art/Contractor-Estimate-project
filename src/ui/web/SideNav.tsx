import Ionicons from '@expo/vector-icons/Ionicons';
import { router, usePathname } from 'expo-router';
import { Pressable, View } from 'react-native';

import { inboxCounts } from '@/engine/inbox';
import { useApp } from '@/store/AppContext';

import { BrandMark } from '../BrandMark';
import { Text } from '../text';
import { C } from '../theme';
import { D, hoverStyle } from '../wide';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
interface Item { label: string; path: string; icon: IconName; active: IconName; tab?: boolean; match?: RegExp }

const WORK: Item[] = [
  { label: 'Home', path: '/', icon: 'home-outline', active: 'home', tab: true, match: /^\/$/ },
  { label: 'Jobs', path: '/jobs', icon: 'briefcase-outline', active: 'briefcase', tab: true, match: /^\/(jobs|job\/|estimate\/|site\/|questions|work$|floor-plan|scan)/ },
  { label: 'Schedule', path: '/schedule', icon: 'calendar-outline', active: 'calendar', tab: true, match: /^\/(schedule|event)/ },
];
const MONEY: Item[] = [
  { label: 'Receipts', path: '/receipts', icon: 'receipt-outline', active: 'receipt', match: /^\/receipts/ },
  { label: 'Money sheet', path: '/books', icon: 'stats-chart-outline', active: 'stats-chart', match: /^\/books/ },
];
const SETUP: Item[] = [
  { label: 'My prices', path: '/pricing', icon: 'pricetags-outline', active: 'pricetags', match: /^\/(pricing|price-book|job-type|past-job)/ },
  { label: 'Crew and subs', path: '/team', icon: 'people-outline', active: 'people', match: /^\/team$/ },
  { label: 'Settings', path: '/me', icon: 'settings-outline', active: 'settings', tab: true, match: /^\/(me|settings|account|plan|language|connections|adu|team-accounts|terms)/ },
];

/** Opens a place from the rail: screens stacked on top are closed first, so the rail never piles pages up. */
function go(path: string, tab?: boolean) {
  if (router.canDismiss()) router.dismissAll();
  if (tab) router.navigate(path as never);
  else router.push(path as never);
}

/**
 * The left rail of the web app on a computer screen: every place in the app one click away, and New estimate on top.
 * Phones keep their tab bar; this is only drawn in a wide browser window.
 */
export function SideNav() {
  const path = usePathname();
  const { inbox = [], profile } = useApp();
  const waiting = inboxCounts(inbox).waiting;
  const row = (it: Item) => {
    const on = !!it.match?.test(path);
    return (
      <Pressable key={it.path} accessibilityRole="link" accessibilityState={{ selected: on }} accessibilityLabel={it.label} onPress={() => go(it.path, it.tab)}
        style={hoverStyle((hovered) => ({ flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, height: 40, borderRadius: 10, paddingHorizontal: 12,
          backgroundColor: on ? D.railOn : hovered ? 'rgba(255,255,255,0.05)' : 'transparent' }))}>
        <Ionicons name={on ? it.active : it.icon} size={19} color={on ? '#FFFFFF' : D.railMuted} />
        <Text style={{ flex: 1, fontSize: 14.5, fontWeight: on ? '600' : '500', color: on ? '#FFFFFF' : D.railInk }} numberOfLines={1}>{it.label}</Text>
        {it.path === '/receipts' && waiting ? (
          <View style={{ minWidth: 20, height: 20, borderRadius: 10, backgroundColor: C.orange, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
            <Text raw style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>{String(waiting)}</Text>
          </View>
        ) : null}
      </Pressable>
    );
  };
  const group = (title: string, items: Item[]) => (
    <View style={{ gap: 2 }}>
      <Text style={{ color: D.railMuted, fontSize: 11.5, fontWeight: '600', letterSpacing: 0.4, paddingHorizontal: 12, paddingBottom: 6 }}>{title}</Text>
      {items.map(row)}
    </View>
  );
  return (
    <View accessibilityRole={'navigation' as never} style={{ width: 236, backgroundColor: D.rail, paddingHorizontal: 12, paddingTop: 20, paddingBottom: 14, gap: 22 }}>
      <Pressable accessibilityRole="link" accessibilityLabel="Studwise AI, Home" onPress={() => go('/', true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8 }}>
        <BrandMark size={30} />
        <Text style={{ fontSize: 18, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.3 }}>Studwise AI</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="New estimate" onPress={() => go('/new', true)}
        style={hoverStyle((hovered) => ({ flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8, backgroundColor: hovered ? '#FF7D36' : C.orange, borderRadius: 12, height: 44 }))}>
        <Ionicons name="add" size={21} color="#FFFFFF" />
        <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>New estimate</Text>
      </Pressable>
      {group('Work', WORK)}
      {group('Money', MONEY)}
      {group('Set up', SETUP)}
      <View style={{ flex: 1 }} />
      <View style={{ borderTopWidth: 1, borderColor: D.railLine, paddingTop: 10, gap: 2 }}>
        {row({ label: 'Help and support', path: '/help', icon: 'help-circle-outline', active: 'help-circle', match: /^\/(help|report)/ })}
        {profile ? (
          <Pressable accessibilityRole="link" accessibilityLabel="Company info" onPress={() => go('/settings?s=company')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingTop: 10 }}>
            <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' }}>
              <Text raw style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>{profile.companyName.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || 'S'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text raw style={{ color: '#FFFFFF', fontSize: 13.5, fontWeight: '600' }} numberOfLines={1}>{profile.companyName}</Text>
              {profile.contactName ? <Text raw style={{ color: D.railMuted, fontSize: 12 }} numberOfLines={1}>{profile.contactName}</Text> : null}
            </View>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
