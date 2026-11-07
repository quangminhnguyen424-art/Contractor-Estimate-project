import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCloud } from '@/cloud/CloudProvider';
import { useState } from 'react';
import { Platform, Pressable, Share, View } from 'react-native';

import { Text } from '@/ui/text';
import { Tick } from '@/ui/tick';
import { defaultNotices } from '@/engine/legal';
import { CLAUDE_MODEL, testClaudeKey } from '@/engine/ai';
import type { JobTypeId, Lang, PaymentMilestone, Profile } from '@/engine/types';
import { useApp } from '@/store/AppContext';
import { Banner, Button, C, Field, Label, List, ListRow, Muted, NumberField, Screen, Segmented } from '@/ui/kit';
import { hostSave, inClaudeApp } from '@/ui/host';
import { EMPTY_WORK } from '@/engine/profile';
import { JobTypeChips } from '@/ui/JobTypes';
import { LogoPicker } from '@/ui/LogoPicker';
import { WorkProfileForm } from '@/ui/WorkProfileForm';
import { confirmAction, notify } from '@/ui/notify';

export default function Settings() {
  const { profile, saveProfile, resetAll, apiKey, saveApiKey, exportData, importData, aiAllowed } = useApp();
  const cloud = useCloud();
  const [p, setP] = useState<Profile>(profile!);
  const [base, setBase] = useState(profile);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [keyText, setKeyText] = useState(apiKey);
  const [showKey, setShowKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState<{ tone: 'ok' | 'warn' | 'info'; text: string } | null>(null);
  const [backupText, setBackupText] = useState('');
  // The profile changed elsewhere (a restored backup, or a type of work added in Pricing). Show it, but
  // never wipe edits not saved yet: then only the list of work you do is taken over.
  if (profile !== base) {
    setBase(profile);
    if (profile) setP(dirty ? { ...p, specialties: profile.specialties } : profile);
  }
  if (!profile) return null;

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => { setP({ ...p, [k]: v }); setSaved(false); setDirty(true); };
  const toggle = (id: JobTypeId) => set('specialties', p.specialties.includes(id) ? p.specialties.filter((x) => x !== id) : [...p.specialties, id]);
  const setMilestone = (i: number, patch: Partial<PaymentMilestone>) => set('schedule', p.schedule.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const schedTotal = p.schedule.reduce((t, m) => t + m.pct, 0);

  const reset = () =>
    confirmAction('Erase everything?', 'Deletes your profile, prices, past jobs and estimates on this device. Export a backup first if you want to keep them.', 'Erase', () => resetAll());

  const saveKey = async () => {
    const k = keyText.trim();
    if (!k) {
      saveApiKey('');
      setKeyStatus({ tone: 'info', text: 'Claude key removed. The app uses the offline reader.' });
      return;
    }
    setKeyStatus({ tone: 'info', text: 'Checking the key with Bidwell…' });
    const err = await testClaudeKey(k);
    if (err) {
      setKeyStatus({ tone: 'warn', text: err });
      return;
    }
    saveApiKey(k);
    setKeyStatus({ tone: 'ok', text: 'Connected. Bidwell now reads your job notes and photos.' });
  };

  const exportBackup = async () => {
    const json = exportData();
    const name = `bidwell-backup-${new Date().toISOString().slice(0, 10)}.json`;
    if (Platform.OS === 'web') {
      if (inClaudeApp) {
        const r = await hostSave(name, json);
        if (r !== 'unavailable') return;
      }
      // On iPhone home-screen apps a plain download can silently do nothing, so use the share sheet when available.
      try {
        const file = new File([json], name, { type: 'application/json' });
        if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: name });
          return;
        }
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return; // the user closed the share sheet
      }
      try {
        const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        return;
      } catch {
        setBackupText(json);
        notify('Copy your backup', 'The backup text is in the box below. Copy it and save it somewhere safe.');
        return;
      }
    }
    try {
      await Share.share({ title: name, message: json });
    } catch {
      setBackupText(json);
      notify('Copy your backup', 'Sharing failed (the backup may be too large). The backup text is in the box below: copy it and save it somewhere safe.');
    }
  };

  const pickBackupFile = () => {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json,text/plain';
      input.onchange = async () => {
        const f = input.files?.[0];
        if (f) setBackupText(await f.text());
      };
      input.click();
    } catch {
      notify('Could not open files', 'Paste the backup text into the box instead.');
    }
  };

  const restore = () =>
    confirmAction('Restore this backup?', 'Everything on this device is replaced by the backup.', 'Restore', () => {
      setDirty(false); // show the restored profile in full
      const r = importData(backupText);
      if (!r.ok) notify('Could not restore', r.message);
      else {
        setBackupText('');
        notify(r.message);
      }
    });

  return (
    <Screen footer={<Button title={saved ? 'Saved ✓' : 'Save settings'} disabled={schedTotal !== 100}
      onPress={() => { saveProfile({ ...p, specialties: Array.from(new Set([...p.specialties, 'small' as JobTypeId])) }); setSaved(true); setDirty(false); }} />}>
      <List>
        <ListRow icon="person-circle" title={cloud.user ? (cloud.user.email ?? 'Account') : 'Log in to Bidwell'} sub={cloud.user ? 'Account, backup and sync' : 'Backup, AI and online signing'}
          onPress={() => router.push(cloud.user ? '/account' : '/login')} />
        <ListRow icon="pricetags" title="My pricing" sub="Your rates and price book" onPress={() => router.push('/pricing')} />
        <ListRow icon="people" title="Crew & subs" sub="Who works your jobs and their rates" onPress={() => router.push('/team')} />
        <ListRow icon="git-network" title="Connected apps" sub="QuickBooks, Sheets, Calendar, Zapier" onPress={() => router.push('/connections')} />
        <ListRow icon="chatbubbles" title="Help & support" sub="Chat with Bidwell AI, report a problem" onPress={() => router.push('/help')} />
        <ListRow icon="shield-checkmark" title="Terms, privacy and AI" onPress={() => router.push('/terms')} />
      </List>
      <Text style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>Tap a section to open it.</Text>
      <Fold title="Company">
        <Field label="Company name" value={p.companyName} onChangeText={(v) => set('companyName', v)} />
        <Field label="Your name" value={p.contactName} onChangeText={(v) => set('contactName', v)} />
        <Field label="Phone" value={p.phone} onChangeText={(v) => set('phone', v)} keyboardType="phone-pad" />
        <Field label="Email" value={p.email} onChangeText={(v) => set('email', v)} autoCapitalize="none" keyboardType="email-address" />
        <Field label="Contractor registration #" value={p.license} onChangeText={(v) => set('license', v)} autoCapitalize="characters" />
        <LogoPicker value={p.logo} onChange={(v) => set('logo', v)} />
      </Fold>

      <Fold title="Getting paid">
        <Field label="Online payment link (optional)" value={p.payLink ?? ''} onChangeText={(v) => set('payLink', v.trim() || undefined)}
          placeholder="https://buy.stripe.com/… or your Square / PayPal link" autoCapitalize="none" keyboardType="url"
          help="Your own link from Stripe, Square or PayPal. Clients see a Pay online button on quotes, invoices and after they sign. Money goes straight to you." />
        <Field label="Other ways to pay (optional)" value={p.payNote ?? ''} onChangeText={(v) => set('payNote', v || undefined)} multiline maxLength={240}
          placeholder="e.g. Zelle 253-555-0100 · Checks payable to Smith Remodeling LLC" />
      </Fold>

      <Fold title="Work you do">
        <JobTypeChips selected={p.specialties} onToggle={toggle} />
        <Muted style={{ fontSize: 13 }}>Add your own types of work and questions in Pricing.</Muted>
      </Fold>

      <Fold title="Your typical jobs">
        <Muted style={{ fontSize: 13 }}>Bidwell reads this with every job so its questions, notes and answers fit how you work.</Muted>
        <WorkProfileForm value={p.work ?? EMPTY_WORK} onChange={(w) => set('work', w)} />
      </Fold>

      <Fold title="About your business (for Bidwell)">
        <Field label="How you work" multiline value={p.about} onChangeText={(v) => set('about', v)} maxLength={2000}
          placeholder="e.g. Mid-range remodels in King County. I sub out electrical. I always include permits and dump fees. I aim for 25% margin."
          help="Bidwell reads this with every job, so its questions and notes fit how you work." />
      </Fold>

      <Fold title="Pricing rules">
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <NumberField label="Default markup" suffix="%" value={p.markupPct} onChange={(v) => set('markupPct', v)} style={{ flex: 1 }} />
          <NumberField label="Never below" suffix="%" value={p.minMarkupPct} onChange={(v) => set('minMarkupPct', v)} style={{ flex: 1 }} />
        </View>
        <NumberField label="Sales tax rate" suffix="%" value={p.salesTaxPct} onChange={(v) => set('salesTaxPct', v)}
          help="Added to the client total. Use the rate where the work is done." />
        <NumberField label="Quote valid for" suffix="days" value={p.quoteValidDays} onChange={(v) => set('quoteValidDays', v)} decimals={false} />
        <Label>Default quote language</Label>
        <Segmented<Lang> value={p.quoteLanguage} onChange={(v) => set('quoteLanguage', v)}
          options={[{ value: 'en', label: 'English' }, { value: 'vi', label: 'Tiếng Việt' }]} />
      </Fold>

      <Fold title="Payment schedule">
        {p.schedule.map((m, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
            <Field label={`Step ${i + 1}`} value={m.label} onChangeText={(v) => setMilestone(i, { label: v })} style={{ flex: 2 }} />
            <NumberField label="Percent" suffix="%" value={m.pct} onChange={(v) => setMilestone(i, { pct: v })} style={{ flex: 1 }} />
          </View>
        ))}
        {schedTotal !== 100 ? <Banner tone="warn" title={`Adds up to ${schedTotal}%. It needs to total 100%.`} /> : null}
      </Fold>

      <Fold title="Notices on your quotes">
        <Muted style={{ fontSize: 13 }}>Added as extra pages to every client quote. You are responsible for using the official wording for your state.</Muted>
        <Tick on={!!p.notices?.waDisclosure} required onPress={() => set('notices', { ...(p.notices ?? defaultNotices()), waDisclosure: !p.notices?.waDisclosure })}>
          <Text style={{ color: C.ink, fontSize: 15 }}>Washington “Notice to Customer” (RCW 18.27.114): residential jobs of $1,000 or more</Text>
        </Tick>
        {p.notices?.waDisclosure ? (
          <>
            <Field label="Registration expires" value={p.notices.regExpires} onChangeText={(v) => set('notices', { ...p.notices!, regExpires: v, checked: false })} placeholder="MM/DD/YYYY" maxLength={20} />
            <Field label="Bond or deposit" value={p.notices.bond} onChangeText={(v) => set('notices', { ...p.notices!, bond: v, checked: false })} placeholder="$12,000 surety bond, company name" maxLength={120} />
            <Field label="Notice text (paste the official L&I form)" value={p.notices.waText} onChangeText={(v) => set('notices', { ...p.notices!, waText: v, checked: false })} multiline maxLength={6000} style={{ minHeight: 160 }} />
          </>
        ) : null}
        <Tick on={!!p.notices?.cancel3Day} required onPress={() => set('notices', { ...(p.notices ?? defaultNotices()), cancel3Day: !p.notices?.cancel3Day })}>
          <Text style={{ color: C.ink, fontSize: 15 }}>Three-day right to cancel (sales made at the client’s home)</Text>
        </Tick>
        {p.notices?.cancel3Day ? (
          <Field label="Cancellation notice (two copies are added)" value={p.notices.cancelText} onChangeText={(v) => set('notices', { ...p.notices!, cancelText: v, checked: false })} multiline maxLength={6000} style={{ minHeight: 160 }} />
        ) : null}
        {p.notices && (p.notices.waDisclosure || p.notices.cancel3Day) ? (
          p.notices.checked
            ? <Banner tone="ok" title="You confirmed these match the official forms." />
            : (
              <>
                <Banner tone="warn" title="Check the wording">The starting text is a draft. Compare it with the official L&I and FTC forms (or ask your attorney), then confirm.</Banner>
                <Button kind="secondary" title="I checked the wording" icon="checkmark" onPress={() => set('notices', { ...p.notices!, checked: true })} />
              </>
            )
        ) : null}
      </Fold>

      <Fold title="Terms, privacy and AI sharing">
        <Banner tone={aiAllowed ? 'ok' : 'warn'} title={aiAllowed ? 'AI sharing is on' : 'AI sharing is off'}>
          {aiAllowed
            ? 'Notes, photos and recordings you choose are sent to Anthropic (Claude) to draft estimates. Not used for training.'
            : 'Nothing is sent to the AI. Bidwell uses the offline reader, which understands less. Turn it on to use AI.'}
        </Banner>
        <Button kind="secondary" title="Terms, privacy and AI sharing" icon="document-text-outline" onPress={() => router.push('/terms')} />
      </Fold>

      <Fold title="Bidwell AI">
        <Text style={{ color: C.ink }}>
          {!aiAllowed ? 'Off · AI sharing is turned off above'
            : apiKey ? `On · your own Claude key (${CLAUDE_MODEL})`
            : inClaudeApp ? 'On · runs on your Claude plan'
            : cloud.user ? 'On · included with your Bidwell account'
            : 'Off · log in to turn it on'}
        </Text>
        {!inClaudeApp && !cloud.user ? <Button title="Log in to turn on the AI" icon="log-in-outline" onPress={() => router.push('/login')} /> : null}
        {inClaudeApp ? null : (
          <>
            <Button kind="ghost" title={showKey ? 'Hide: use my own Claude API key' : 'Advanced: use my own Claude API key'} onPress={() => setShowKey((v) => !v)} />
            {showKey || apiKey ? (<>
              <Muted style={{ fontSize: 13 }}>
                Optional. Your account already includes the AI. With your own key from console.anthropic.com, Bidwell uses it instead and Anthropic bills you directly.
                The key stays on this device and is never backed up.
              </Muted>
              <Field label="Claude API key" value={keyText} onChangeText={(v) => { setKeyText(v); setKeyStatus(null); }}
                placeholder="sk-ant-…" autoCapitalize="none" autoCorrect={false} secureTextEntry />
              <Button kind="secondary" title={keyText.trim() ? 'Save and test key' : 'Remove key'} onPress={saveKey} />
              {keyStatus ? <Banner tone={keyStatus.tone} title={keyStatus.text} /> : null}
            </>) : null}
          </>
        )}
      </Fold>

      <Fold title="Backup">
        <Muted style={{ fontSize: 13 }}>
          {cloud.user ? 'Your work is backed up to your account automatically. You can also export a copy as a file.' : 'Your data lives only on this device. Export a backup now and then.'}
        </Muted>
        <Button kind="secondary" title="Export backup" onPress={exportBackup} />
        {Platform.OS === 'web' ? <Button kind="ghost" title="Choose backup file…" onPress={pickBackupFile} /> : null}
        <Field label="Restore from backup" multiline value={backupText} onChangeText={setBackupText}
          placeholder="Paste the backup text here" autoCapitalize="none" autoCorrect={false} />
        <Button kind="secondary" title="Restore backup" disabled={backupText.trim().length < 10} onPress={restore} />
      </Fold>

      <Pressable accessibilityRole="button" onPress={reset} style={{ alignSelf: 'center', padding: 12 }}>
        <Text style={{ color: C.danger, fontWeight: '600' }}>Erase all data on this device</Text>
      </Pressable>
    </Screen>
  );
}

/** A settings section that opens when tapped, so the page stays short. */
function Fold({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.line, overflow: 'hidden' }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((v) => !v)}
        style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 10 }}>
        <Text style={{ flex: 1, color: C.ink, fontSize: 16, fontWeight: '600' }}>{title}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={C.muted} />
      </Pressable>
      {open ? <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 12 }}>{children}</View> : null}
    </View>
  );
}
