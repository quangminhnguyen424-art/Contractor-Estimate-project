import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Linking, Platform, Share, View } from 'react-native';

import { newId } from '@/engine/format';
import { dayLabel } from '@/engine/schedule';
import { LANG_NAMES, type CrewLang } from '@/engine/site';
import { ATTEND, confirmText, morningCheck, newMember, suggestDates, type AttendState, type TeamMember } from '@/engine/team';
import { useApp } from '@/store/AppContext';
import { Banner, Button, C, Card, Chip, Field, H2, Muted, NumberField, Screen, Segmented } from '@/ui/kit';
import { confirmAction } from '@/ui/notify';
import { Text } from '@/ui/text';
import { useToday } from '@/ui/useToday';

async function textTo(phone: string, body: string) {
  const url = `sms:${phone.replace(/[^\d+]/g, '')}${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(body)}`;
  try { await Linking.openURL(url); } catch { await Share.share({ message: body }).catch(() => {}); }
}

/** Crew and subcontractors, and the morning check: who is coming today. */
export default function TeamScreen() {
  const { team = [], events, projects, saveMember, deleteMember, markAttendance } = useApp();
  const today = useToday();
  const [edit, setEdit] = useState<TeamMember | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const checks = morningCheck(events, team, today);
  const siteName = (projectId?: string, fallback = '') => projects.find((p) => p.id === projectId)?.title ?? fallback;

  const mark = (eventId: string, memberId: string, state: AttendState, movedTo?: string) => {
    markAttendance(eventId, memberId, { state, at: new Date().toISOString(), ...(movedTo ? { movedTo } : {}) });
    setMoving(null);
  };

  return (
    <Screen>
      <Card>
        <H2>Today’s crew check</H2>
        {checks.length === 0 ? (
          <Muted>No one is booked today. Book crew days on the Schedule tab and pick who is coming.</Muted>
        ) : checks.map(({ event, member, attendance }) => {
          const key = `${event.id}-${member.id}`;
          return (
            <View key={key} style={{ gap: 8, paddingVertical: 10, borderTopWidth: 1, borderColor: C.lineSoft }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name={(attendance ? ATTEND[attendance.state].icon : 'help-circle-outline') as never} size={22} color={attendance ? ATTEND[attendance.state].color : C.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.ink, fontWeight: '700' }}>{member.name}{member.trade ? ` · ${member.trade}` : ''}</Text>
                  <Text style={{ color: C.muted, fontSize: 13 }}>
                    {event.time || 'All day'} · {siteName(event.projectId, event.title)}{attendance ? ` · ${ATTEND[attendance.state].en}` : ' · not confirmed'}
                  </Text>
                </View>
                {member.phone ? <Button kind="ghost" title="Text" icon="chatbubble-outline" onPress={() => textTo(member.phone, confirmText(member, event, siteName(event.projectId, event.title)))} /> : null}
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {(['coming', 'late', 'worked', 'no-show'] as AttendState[]).map((st) => (
                  <Chip key={st} label={ATTEND[st].en} selected={attendance?.state === st} onPress={() => mark(event.id, member.id, st)} />
                ))}
                <Chip label="Reschedule…" selected={moving === key} onPress={() => setMoving(moving === key ? null : key)} />
              </View>
              {moving === key ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {suggestDates(today).map((d) => <Chip key={d} label={dayLabel(d, today)} onPress={() => mark(event.id, member.id, 'moved', d)} />)}
                </View>
              ) : null}
            </View>
          );
        })}
        <Muted style={{ fontSize: 12 }}>“Worked” adds their day to the job’s labor cost (from their rate). “Reschedule” books them on the new day.</Muted>
      </Card>

      {edit ? (
        <Card>
          <H2>{team.some((m) => m.id === edit.id) ? 'Edit' : 'Add someone'}</H2>
          <Segmented options={[{ value: 'crew', label: 'My crew' }, { value: 'sub', label: 'Subcontractor' }]} value={edit.role} onChange={(role) => setEdit({ ...edit, role })} />
          <Field label="Name" value={edit.name} onChangeText={(name) => setEdit({ ...edit, name })} maxLength={60} />
          <Field label="Trade" value={edit.trade} onChangeText={(trade) => setEdit({ ...edit, trade })} maxLength={40} placeholder="Tile, plumbing, electrical…" />
          <Field label="Mobile" value={edit.phone} onChangeText={(phone) => setEdit({ ...edit, phone })} keyboardType="phone-pad" maxLength={30} />
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
            <NumberField label="Cost to you (loaded)" suffix="$" value={edit.rate} onChange={(rate) => setEdit({ ...edit, rate })} style={{ flex: 1 }} />
            <View style={{ flex: 1 }}>
              <Segmented options={[{ value: 'day', label: '/day' }, { value: 'hour', label: '/hr' }, { value: 'job', label: '/job' }]} value={edit.rateUnit} onChange={(rateUnit) => setEdit({ ...edit, rateUnit })} />
            </View>
          </View>
          <Muted style={{ fontSize: 13 }}>Messages in</Muted>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {(Object.keys(LANG_NAMES) as CrewLang[]).map((l) => <Chip key={l} label={LANG_NAMES[l].native} selected={edit.lang === l} onPress={() => setEdit({ ...edit, lang: l })} />)}
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="Save" icon="checkmark" disabled={!edit.name.trim()} style={{ flex: 1 }} onPress={() => { saveMember({ ...edit, name: edit.name.trim() }); setEdit(null); }} />
            <Button kind="secondary" title="Cancel" style={{ flex: 1 }} onPress={() => setEdit(null)} />
          </View>
        </Card>
      ) : null}

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <H2 style={{ flex: 1 }}>Crew & subs</H2>
          <Button kind="ghost" title="Add" icon="add" onPress={() => setEdit(newMember(newId()))} />
        </View>
        {team.length === 0 ? <Muted>Add the people you work with. Their rate stays private; it is only used to add labor to your job costs.</Muted> : null}
        {team.map((m) => (
          <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderColor: C.lineSoft }}>
            <Ionicons name={m.role === 'sub' ? 'construct-outline' : 'person-outline'} size={20} color={C.accent} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.ink, fontWeight: '600' }}>{m.name}</Text>
              <Text style={{ color: C.muted, fontSize: 12 }}>{m.role === 'sub' ? 'Subcontractor' : 'Crew'}{m.trade ? ` · ${m.trade}` : ''}{m.rate ? ` · $${m.rate}/${m.rateUnit}` : ''}</Text>
            </View>
            <Button kind="ghost" title="Edit" onPress={() => setEdit(m)} />
            <Button kind="ghost" title="×" accessibilityLabel={`Remove ${m.name}`} onPress={() => confirmAction('Remove this person?', m.name, 'Remove', () => deleteMember(m.id))} />
          </View>
        ))}
      </Card>
      {team.length > 0 && !events.some((e) => e.crew?.length) ? (
        <Banner tone="info" title="Next: book a crew day">On the Schedule tab, add a Crew day and tap who is coming. Bidwell checks in with you that morning.</Banner>
      ) : null}
    </Screen>
  );
}
