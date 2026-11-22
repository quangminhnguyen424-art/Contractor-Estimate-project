import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Image, Pressable, View } from 'react-native';

import { useCloud } from '@/cloud/CloudProvider';
import { useLanguage } from '@/i18n';
import { useApp } from '@/store/AppContext';
import { inClaudeApp } from '@/ui/host';
import { C, List, ListRow, Muted, Screen, Section } from '@/ui/kit';
import { Text } from '@/ui/text';

import type { SettingsPage } from '../settings';

const open = (s: SettingsPage) => router.push(`/settings?s=${s}`);

/** Me: who you are, then one row per thing you can set up. Every row opens its own page. */
export default function Me() {
  const { profile, team = [], aiAllowed, apiKey, presets, inbox = [], projects } = useApp();
  const receiptsWaiting = inbox.filter((x) => x.status === 'new').length;
  const cloud = useCloud();
  const { language } = useLanguage();
  if (!profile) return null;
  const types = profile.specialties.filter((id) => id !== 'small').length;
  const priced = Object.keys(presets).length;
  const aiOn = aiAllowed && (inClaudeApp || !!apiKey || !!cloud.user);
  const initials = profile.companyName.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || 'B';
  const version = Constants.expoConfig?.version;

  return (
    <Screen>
      <Pressable accessibilityRole="button" accessibilityLabel={`${profile.companyName}. Edit company info.`} onPress={() => open('company')}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 6, opacity: pressed ? 0.7 : 1 })}>
        {profile.logo ? (
          <Image source={{ uri: profile.logo }} resizeMode="contain" style={{ width: 52, height: 52, borderRadius: 12, backgroundColor: C.panel }} />
        ) : (
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '600' }}>{initials}</Text>
          </View>
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <Text raw style={{ color: C.ink, fontSize: 20, fontWeight: '700', letterSpacing: -0.2 }} numberOfLines={1}>{profile.companyName}</Text>
          <Text style={{ color: C.muted, fontSize: 14 }} numberOfLines={1}>{[profile.contactName, profile.phone].filter(Boolean).join(' · ') || 'Add your name and phone'}</Text>
        </View>
        <Text style={{ color: C.accent, fontSize: 15, fontWeight: '500' }}>Edit</Text>
      </Pressable>

      <Section title="Prices and quotes" />
      <List>
        <ListRow title="My prices" right={priced ? `${types} type${types === 1 ? '' : 's'} of work` : 'Not set'} onPress={() => router.push('/pricing')} />
        <ListRow title="Markup and tax" right={`${profile.markupPct}% · ${profile.salesTaxPct}%`} onPress={() => open('rules')} />
        <ListRow title="Payment schedule" right={`${profile.schedule.length} payment${profile.schedule.length === 1 ? '' : 's'}`} onPress={() => open('schedule')} />
        <ListRow title="Getting paid" right={profile.payLink ? 'Payment link' : profile.payNote ? 'Set' : 'Not set'} onPress={() => open('pay')} />
        <ListRow title="Notices on quotes" onPress={() => open('notices')} />
      </List>

      <Section title="Your work" />
      <List>
        <ListRow title="Work you do" right={`${types} type${types === 1 ? '' : 's'} of work`} onPress={() => open('work')} />
        <ListRow title="How you work" onPress={() => open('about')} />
        <ListRow title="Receipts" right={receiptsWaiting ? `${receiptsWaiting} to sort` : undefined} onPress={() => router.push('/receipts')} />
        <ListRow title="Money sheet" right={projects.length ? (projects.length === 1 ? '1 job' : `${projects.length} jobs`) : undefined} onPress={() => router.push('/books')} />
        <ListRow title="Crew and subs" right={team.length ? String(team.length) : undefined} onPress={() => router.push('/team')} />
        <ListRow title="ADU check page" onPress={() => router.push('/adu')} />
        <ListRow title="Connected apps" onPress={() => router.push('/connections')} />
      </List>

      <Section title="Account" />
      <List>
        <ListRow title={cloud.user ? (cloud.user.email ?? 'Account') : 'Log in to Studwise'} onPress={() => router.push(cloud.user ? '/account' : '/login')} />
        <ListRow title="Your plan" onPress={() => router.push('/plan')} />
        {cloud.user && <ListRow title="Team accounts" onPress={() => router.push('/team-accounts')} />}
        <ListRow title="Backup" right={cloud.user ? 'On' : 'This phone only'} onPress={() => open('backup')} />
      </List>

      <Section title="App" />
      <List>
        <ListRow title="Language" right={language?.name ?? 'English'} onPress={() => router.push('/language')} />
        <ListRow title="Studwise AI" right={aiOn ? 'On' : 'Off'} onPress={() => open('ai')} />
        <ListRow title="Help and support" onPress={() => router.push('/help')} />
        <ListRow title="Terms and privacy" onPress={() => router.push('/terms')} />
      </List>

      <Muted style={{ textAlign: 'center', fontSize: 12 }}>Studwise AI{version ? ` · version ${version}` : ''}</Muted>
    </Screen>
  );
}
