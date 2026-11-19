import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Share, View } from 'react-native';

import { useCloud } from '@/cloud/CloudProvider';
import { cancelInvite, getTeam, inviteMessage, inviteToTeam, joinTeam, leaveTeam, removeFromTeam, TEAM_SIZE, type TeamInfo } from '@/cloud/team';
import { useMyPlan } from '@/cloud/usePlan';
import { useApp } from '@/store/AppContext';
import { Button, C, Card, Field, H2, Muted, Screen } from '@/ui/kit';
import { confirmAction, notify } from '@/ui/notify';
import { Text } from '@/ui/text';

const day = (d: string) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** Team accounts: the owner invites up to 2 people to work in this company; others join with a code, or leave. */
export default function TeamAccounts() {
  const cloud = useCloud();
  const { profile } = useApp();
  const { plan } = useMyPlan();
  const [team, setTeam] = useState<TeamInfo | null | undefined>(undefined);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => { getTeam().then(setTeam).catch(() => setTeam(null)); }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true); setErr(null);
    try { await fn(); after?.(); load(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Something went wrong. Try again.'); }
    finally { setBusy(false); }
  };

  const share = async (c: string, to: string) => {
    const msg = inviteMessage(profile?.companyName ?? '', c, to);
    if (Platform.OS === 'web') { await navigator.clipboard?.writeText(msg).catch(() => {}); notify('Invite copied', 'Paste it in a text or email to them.'); return; }
    await Share.share({ message: msg }).catch(() => {});
  };

  const canShare = !plan || plan.plan === 'team' || plan.plan === 'beta';
  const others = team ? team.members.length + team.invites.length : 0;

  if (team === undefined) return <Screen><Muted>Checking…</Muted></Screen>;
  if (team === null) return <Screen><Muted>Team accounts are not available right now. Check your connection and try again.</Muted></Screen>;

  if (team.role === 'member') {
    return (
      <Screen>
        <Card style={{ gap: 6 }}>
          <Muted style={{ fontSize: 13 }}>You work in this company’s account</Muted>
          <Text raw style={{ color: C.ink, fontSize: 18, fontWeight: '800' }}>{team.owner_email ?? ''}</Text>
          <Muted>{'You see and change the same jobs, quotes, photos and schedule. Plan and billing are managed by the owner.'}</Muted>
        </Card>
        <H2>People on this team</H2>
        <Person email={team.owner_email ?? ''} note="Owner" />
        {team.members.map((m) => <Person key={m.member} email={m.email} note={m.member === cloud.user?.id ? 'You' : `Joined ${day(m.joined_at)}`} />)}
        <Button title="Leave this team" icon="exit-outline" kind="secondary" disabled={busy}
          onPress={() => confirmAction('Leave this team?', 'You will stop seeing this company’s jobs. Your own work from before you joined comes back.', 'Leave',
            () => run(async () => { await cloud.syncNow(); await leaveTeam(); await cloud.syncNow(); }, () => notify('You left the team', 'Your own account is back.')))} />
        {!!err && <Text style={{ color: C.danger }}>{err}</Text>}
      </Screen>
    );
  }

  return (
    <Screen>
      <Muted>{`The Team plan lets up to ${TEAM_SIZE} people work in this company: the same jobs, quotes, photos, schedule and signatures. Everyone logs in with their own email and password.`}</Muted>

      <H2>People on this team</H2>
      <Person email={team.owner_email ?? cloud.user?.email ?? ''} note="You · owner" />
      {team.members.map((m) => (
        <Person key={m.member} email={m.email} note={`Joined ${day(m.joined_at)}`}
          onRemove={() => confirmAction('Remove this person?', `${m.email} will stop seeing this company’s jobs right away.`, 'Remove', () => run(() => removeFromTeam(m.member)))} />
      ))}
      {team.invites.map((i) => (
        <Card key={i.code} style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="mail-outline" size={20} color={C.ink2} />
            <View style={{ flex: 1 }}>
              <Text raw style={{ color: C.ink, fontWeight: '700' }}>{i.email}</Text>
              <Muted style={{ fontSize: 13 }}>{`Invited · code ${i.code} · works until ${day(i.expires_at)}`}</Muted>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Send again" icon="share-outline" kind="secondary" style={{ flex: 1 }} onPress={() => share(i.code, i.email)} />
            <Button title="Cancel" kind="secondary" style={{ flex: 1 }} onPress={() => run(() => cancelInvite(i.code))} />
          </View>
        </Card>
      ))}

      {others < TEAM_SIZE - 1 && (
        canShare ? (
          <Card style={{ gap: 10 }}>
            <H2>Invite someone</H2>
            <Field label="Their email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="office@yourcompany.com" />
            <Button title="Make invite" icon="person-add" disabled={busy || !email.trim()}
              onPress={() => run(async () => { const c = await inviteToTeam(email); await share(c, email.trim()); setEmail(''); })} />
            <Muted style={{ fontSize: 12 }}>They install Studwise, make an account with this email, and enter the code under Me → Team accounts.</Muted>
          </Card>
        ) : (
          <Card style={{ gap: 10 }}>
            <Muted>Sharing your company with other people is part of the Team plan.</Muted>
            <Button title="See the Team plan" icon="diamond" onPress={() => router.push('/plan')} />
          </Card>
        )
      )}

      {team.role === 'solo' && (
        <Card style={{ gap: 10 }}>
          <H2>Join a team</H2>
          <Muted>Got a code from your company? Enter it here.</Muted>
          <Field label="Invite code" value={code} onChangeText={(t) => setCode(t.toUpperCase())} autoCapitalize="characters" maxLength={8} placeholder="A1B2C3D4" />
          <Button title="Join" icon="enter-outline" disabled={busy || code.trim().length < 8}
            onPress={() => confirmAction('Join this team?', 'You will work in that company’s jobs and quotes. Your own jobs are kept safe and come back if you leave the team.', 'Join',
              () => run(async () => { await cloud.syncNow(); await joinTeam(code); await cloud.syncNow(); setCode(''); }, () => notify('You joined the team', 'You now see the company’s jobs.')))} />
        </Card>
      )}
      {!!err && <Text style={{ color: C.danger }}>{err}</Text>}
    </Screen>
  );
}

function Person({ email, note, onRemove }: { email: string; note: string; onRemove?: () => void }) {
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Ionicons name="person-circle" size={28} color={C.accent} />
      <View style={{ flex: 1 }}>
        <Text raw style={{ color: C.ink, fontWeight: '700' }}>{email}</Text>
        <Muted style={{ fontSize: 13 }}>{note}</Muted>
      </View>
      {onRemove && <Button title="Remove" kind="secondary" onPress={onRemove} />}
    </Card>
  );
}
