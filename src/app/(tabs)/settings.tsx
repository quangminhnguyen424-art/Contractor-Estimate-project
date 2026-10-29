import { useState } from 'react';
import { Platform, Pressable, Share, Text, View } from 'react-native';

import { CLAUDE_MODEL, testClaudeKey } from '@/engine/ai';
import type { JobTypeId, Lang, PaymentMilestone, Profile } from '@/engine/types';
import { useApp } from '@/store/AppContext';
import { Banner, Button, C, Card, Field, H2, Label, Muted, NumberField, Screen, Segmented } from '@/ui/kit';
import { hostSave, inClaudeApp } from '@/ui/host';
import { EMPTY_WORK } from '@/engine/profile';
import { JobTypeChips } from '@/ui/JobTypes';
import { WorkProfileForm } from '@/ui/WorkProfileForm';
import { confirmAction, notify } from '@/ui/notify';

export default function Settings() {
  const { profile, saveProfile, resetAll, apiKey, saveApiKey, exportData, importData } = useApp();
  const [p, setP] = useState<Profile>(profile!);
  const [base, setBase] = useState(profile);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [keyText, setKeyText] = useState(apiKey);
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
    confirmAction('Erase everything?', 'Deletes your profile, prices, past jobs and estimates on this device. Export a backup first if you want to keep them.', 'Erase', resetAll);

  const saveKey = async () => {
    const k = keyText.trim();
    if (!k) {
      saveApiKey('');
      setKeyStatus({ tone: 'info', text: 'Claude key removed. The app uses the offline reader.' });
      return;
    }
    setKeyStatus({ tone: 'info', text: 'Checking the key with Claude…' });
    const err = await testClaudeKey(k);
    if (err) {
      setKeyStatus({ tone: 'warn', text: err });
      return;
    }
    saveApiKey(k);
    setKeyStatus({ tone: 'ok', text: 'Connected. Claude now reads your job notes and photos.' });
  };

  const exportBackup = async () => {
    const json = exportData();
    const name = `estimator-backup-${new Date().toISOString().slice(0, 10)}.json`;
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
      <Card>
        <H2>Company</H2>
        <Field label="Company name" value={p.companyName} onChangeText={(v) => set('companyName', v)} />
        <Field label="Your name" value={p.contactName} onChangeText={(v) => set('contactName', v)} />
        <Field label="Phone" value={p.phone} onChangeText={(v) => set('phone', v)} keyboardType="phone-pad" />
        <Field label="Email" value={p.email} onChangeText={(v) => set('email', v)} autoCapitalize="none" keyboardType="email-address" />
        <Field label="Contractor registration #" value={p.license} onChangeText={(v) => set('license', v)} autoCapitalize="characters" />
      </Card>

      <Card>
        <H2>Work you do</H2>
        <JobTypeChips selected={p.specialties} onToggle={toggle} />
        <Muted style={{ fontSize: 13 }}>Add your own types of work and questions in Pricing.</Muted>
      </Card>

      <Card>
        <H2>Your typical jobs</H2>
        <Muted style={{ fontSize: 13 }}>Claude reads this with every job so its questions, notes and answers fit how you work.</Muted>
        <WorkProfileForm value={p.work ?? EMPTY_WORK} onChange={(w) => set('work', w)} />
      </Card>

      <Card>
        <H2>About your business (for Claude)</H2>
        <Field label="How you work" multiline value={p.about} onChangeText={(v) => set('about', v)} maxLength={2000}
          placeholder="e.g. Mid-range remodels in King County. I sub out electrical. I always include permits and dump fees. I aim for 25% margin."
          help="Claude reads this with every job, so its questions and notes fit how you work." />
      </Card>

      <Card>
        <H2>Pricing rules</H2>
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
      </Card>

      <Card>
        <H2>Payment schedule</H2>
        {p.schedule.map((m, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
            <Field label={`Step ${i + 1}`} value={m.label} onChangeText={(v) => setMilestone(i, { label: v })} style={{ flex: 2 }} />
            <NumberField label="Percent" suffix="%" value={m.pct} onChange={(v) => setMilestone(i, { pct: v })} style={{ flex: 1 }} />
          </View>
        ))}
        {schedTotal !== 100 ? <Banner tone="warn" title={`Adds up to ${schedTotal}%. It needs to total 100%.`} /> : null}
      </Card>

      <Card>
        <H2>Claude AI</H2>
        <Text style={{ color: C.ink }}>
          {apiKey ? `Connected · ${CLAUDE_MODEL}` : inClaudeApp ? 'Built in · runs on your Claude plan' : 'Not connected · using the offline reader'}
        </Text>
        {inClaudeApp && !apiKey ? (
          <Muted style={{ fontSize: 13 }}>
            You are using the app inside Claude, so Claude reads your notes and photos with no API key. The first time, Claude asks you to allow it.
          </Muted>
        ) : null}
        {inClaudeApp ? null : (<>
        <Muted style={{ fontSize: 13 }}>
          For your own use. Create a key at console.anthropic.com (API Keys), paste it here, and set a monthly spending limit there.
          The key is saved only on this device and is never included in backups. Job notes and photos you send go to Anthropic to be read.
        </Muted>
        <Field label="Claude API key" value={keyText} onChangeText={(v) => { setKeyText(v); setKeyStatus(null); }}
          placeholder="sk-ant-…" autoCapitalize="none" autoCorrect={false} secureTextEntry />
        <Button kind="secondary" title={keyText.trim() ? 'Save and test key' : 'Remove key'} onPress={saveKey} />
        {keyStatus ? <Banner tone={keyStatus.tone} title={keyStatus.text} /> : null}
        </>)}
      </Card>

      <Card>
        <H2>Backup</H2>
        <Muted style={{ fontSize: 13 }}>
          Your data lives only on this device. Export a backup now and then, and to move your prices and estimates to another phone or computer, restore it there.
        </Muted>
        <Button kind="secondary" title="Export backup" onPress={exportBackup} />
        {Platform.OS === 'web' ? <Button kind="ghost" title="Choose backup file…" onPress={pickBackupFile} /> : null}
        <Field label="Restore from backup" multiline value={backupText} onChangeText={setBackupText}
          placeholder="Paste the backup text here" autoCapitalize="none" autoCorrect={false} />
        <Button kind="secondary" title="Restore backup" disabled={backupText.trim().length < 10} onPress={restore} />
      </Card>

      <Pressable accessibilityRole="button" onPress={reset} style={{ alignSelf: 'center', padding: 12 }}>
        <Text style={{ color: '#B42318', fontWeight: '600' }}>Erase all data on this device</Text>
      </Pressable>
    </Screen>
  );
}
