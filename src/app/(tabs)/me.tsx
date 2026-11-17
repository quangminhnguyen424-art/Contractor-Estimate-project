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
  const { profile, team = [], aiAllowed, apiKey, presets } = useApp();
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
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.card, borderRadius: 22, borderWidth: 1, borderColor: C.line, padding: 16, opacity: pressed ? 0.85 : 1 })}>
        {profile.logo ? (
          <Image source={{ uri: profile.logo }} resizeMode="contain" style={{ width: 60, height: 60, borderRadius: 14, backgroundColor: '#FFFFFF' }} />
        ) : (
          <View style={{ width: 60, height: 60, borderRadius: 18, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '700' }}>{initials}</Text>
          </View>
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <Text raw style={{ color: C.ink, fontSize: 19, fontWeight: '700' }} numberOfLines={1}>{profile.companyName}</Text>
          <Text style={{ color: C.muted, fontSize: 14 }} numberOfLines={1}>{[profile.contactName, profile.phone].filter(Boolean).join(' · ') || 'Add your name and phone'}</Text>
          <Text style={{ color: C.accent, fontSize: 13, fontWeight: '600' }}>{profile.logo ? 'Edit company info' : 'Add your logo and details'}</Text>
        </View>
      </Pressable>

      <List>
        <ListRow icon="person-circle" title={cloud.user ? (cloud.user.email ?? 'Account') : 'Log in to Bidwell'}
          sub={cloud.user ? 'Account, password, sync' : 'Turns on the AI, backup and online signing'} onPress={() => router.push(cloud.user ? '/account' : '/login')} />
      </List>

      <Section title="Pricing" />
      <List>
        <ListRow icon="pricetags" title="My pricing" sub={priced ? `Your prices for ${types} type${types === 1 ? '' : 's'} of work, and past jobs` : 'Set what you charge for each type of work'} onPress={() => router.push('/pricing')} />
        <ListRow icon="calculator" title="Markup, tax and quote defaults" sub={`${profile.markupPct}% markup · ${profile.salesTaxPct}% tax · quotes valid ${profile.quoteValidDays} days`} onPress={() => open('rules')} />
        <ListRow icon="hammer" title="Work you do" sub={`${types} type${types === 1 ? '' : 's'} of work`} onPress={() => open('work')} />
        <ListRow icon="bulb" title="How you work" sub="What Bidwell should know about your jobs" onPress={() => open('about')} />
      </List>

      <Section title="Quotes and getting paid" />
      <List>
        <ListRow icon="card" title="Getting paid" sub={profile.payLink ? 'Online payment link is on' : profile.payNote ? 'Other ways to pay are set' : 'Add a payment link, Zelle or check details'} onPress={() => open('pay')} />
        <ListRow icon="list" title="Payment schedule" sub={profile.schedule.map((m) => `${m.pct}%`).join(' · ')} onPress={() => open('schedule')} />
        <ListRow icon="document-lock" title="Notices on quotes" sub="State notices added to every quote" onPress={() => open('notices')} />
      </List>

      <Section title="Win more work" />
      <List>
        <ListRow icon="home" title="ADU check page" sub="A free page where homeowners check their lot and send you leads" onPress={() => router.push('/adu')} />
      </List>

      <Section title="Team and apps" />
      <List>
        <ListRow icon="people" title="Crew and subs" sub={team.length ? `${team.length} ${team.length === 1 ? 'person' : 'people'}` : 'Who works your jobs, and their rates'} onPress={() => router.push('/team')} />
        <ListRow icon="git-network" title="Connected apps" sub="QuickBooks, Sheets, Calendar, Zapier" onPress={() => router.push('/connections')} />
      </List>

      <Section title="App" />
      <List>
        <ListRow icon="language" title="Language" right={language?.name ?? 'English'} onPress={() => router.push('/language')} />
        <ListRow icon="sparkles" title="Bidwell AI" sub={aiOn ? 'On' : 'Off'} onPress={() => open('ai')} />
        <ListRow icon="cloud-done" title="Backup" sub={cloud.user ? 'Backed up to your account' : 'Only on this phone · export a copy'} onPress={() => open('backup')} />
        <ListRow icon="chatbubbles" title="Help and support" sub="Chat with Bidwell, report a problem" onPress={() => router.push('/help')} />
        <ListRow icon="shield-checkmark" title="Terms, privacy and AI" onPress={() => router.push('/terms')} />
      </List>

      <Muted style={{ textAlign: 'center', fontSize: 12 }}>Bidwell AI{version ? ` · version ${version}` : ''}</Muted>
    </Screen>
  );
}
