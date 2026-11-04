import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import {
  calendarIcs, estimatesCsv, HOOK_EVENTS, jobsMoneyCsv, NO_CONNECTIONS, paymentsCsv, quickbooksInvoicesCsv, SAMPLE_HOOK_DATA, validHookUrl,
} from '@/engine/connect';
import { useApp } from '@/store/AppContext';
import { HudPanel, Readout } from '@/ui/hud';
import { Banner, Button, C, Card, Chip, Field, Muted, Screen } from '@/ui/kit';
import { Reveal } from '@/ui/motion';
import { notify } from '@/ui/notify';
import { shareTextFile } from '@/ui/shareFile';
import { Text } from '@/ui/text';
import { useToday } from '@/ui/useToday';
import { postHook } from '@/ui/webhook';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Getting the contractor's data into their other apps: spreadsheets, QuickBooks, calendar, Zapier / Make. */
export default function ConnectionsScreen() {
  const { estimates, contracts, events, profile, connections, saveConnections } = useApp();
  const today = useToday();
  const conn = connections ?? NO_CONNECTIONS;
  const [url, setUrl] = useState(conn.webhookUrl);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  if (!profile) return null;
  const company = profile.companyName;
  const stamp = today.replace(/-/g, '');

  const share = async (name: string, text: string, mime: string, uti?: string) => {
    if (!text.trim()) return notify('Nothing to export yet');
    try {
      if (!(await shareTextFile(name, text, mime, uti))) notify('Could not share the file');
    } catch {
      notify('Could not share the file', 'Please try again.');
    }
  };

  const saveUrl = () => {
    const u = url.trim();
    if (u && !validHookUrl(u)) return notify('That link won’t work', 'Paste the full https:// link from Zapier or Make.');
    saveConnections({ ...conn, webhookUrl: u });
    notify(u ? 'Link saved' : 'Link removed', u ? 'New quotes, signatures, invoices and payments are sent to it.' : '');
  };

  const test = async () => {
    setTesting(true);
    const r = await postHook({ ...conn, webhookUrl: url.trim() }, 'test', SAMPLE_HOOK_DATA, company);
    setTesting(false);
    setResult(r.ok ? `Sent ✓ (${r.status})` : `Not sent: ${r.error ?? `the link answered ${r.status}`}`);
  };

  return (
    <Screen>
      <Reveal>
        <HudPanel>
          <Readout color={C.accentDark}>Connected apps</Readout>
          <Text style={{ color: C.ink, fontSize: 22, fontWeight: '700' }}>Your data, in the apps you already use</Text>
          <Muted style={{ fontSize: 13 }}>Spreadsheets, QuickBooks, your calendar, and 5,000+ apps through Zapier or Make.</Muted>
        </HudPanel>
      </Reveal>

      <Service index={1} icon="grid-outline" color="#34D399" title="Excel · Google Sheets · Numbers" sub="Download your numbers as spreadsheet files">
        <Button kind="secondary" title="Estimates" icon="document-text-outline" onPress={() => share(`bidwell-estimates-${stamp}.csv`, estimatesCsv(estimates), 'text/csv')} />
        <Button kind="secondary" title="Jobs: contract, paid, balance" icon="wallet-outline" onPress={() => share(`bidwell-jobs-${stamp}.csv`, jobsMoneyCsv(contracts, estimates, profile, today), 'text/csv')} />
        <Button kind="secondary" title="Payments received" icon="cash-outline" onPress={() => share(`bidwell-payments-${stamp}.csv`, paymentsCsv(contracts, estimates), 'text/csv')} />
        <Muted style={{ fontSize: 12 }}>Client prices only. Your costs and markup stay in the app.</Muted>
      </Service>

      <Service index={2} icon="calculator-outline" color="#2CA01C" title="QuickBooks Online" sub="Invoices ready for QuickBooks’ invoice import">
        <Button kind="secondary" title="Invoices for QuickBooks (CSV)" icon="download-outline"
          onPress={() => share(`quickbooks-invoices-${stamp}.csv`, contracts.some((c) => c.invoices.length) ? quickbooksInvoicesCsv(contracts, estimates, profile) : '', 'text/csv')} />
        <Muted style={{ fontSize: 12 }}>In QuickBooks: Settings (gear) → Import data → Invoices → upload this file. Check the customer names match.</Muted>
      </Service>

      <Service index={3} icon="calendar-outline" color="#A78BFA" title="Google Calendar · Outlook · iPhone" sub="All upcoming appointments in one calendar file">
        <Button kind="secondary" title="Export my schedule" icon="calendar-number-outline"
          onPress={() => share(`bidwell-schedule-${stamp}.ics`, calendarIcs(events, today, company), 'text/calendar', 'com.apple.ical.ics')} />
        <Muted style={{ fontSize: 12 }}>Each appointment can also be added on its own from its page.</Muted>
      </Service>

      <Service index={4} icon="people-outline" color={C.sky} title="Phone contacts" sub="Pick the client from your contacts">
        <Muted style={{ fontSize: 13 }}>
          {Platform.OS === 'web' ? 'In the iPhone app, tap “From contacts” when you start an estimate to fill in the name, phone and address.' : 'When you start an estimate, tap “From contacts” to fill in the client’s name and address.'}
        </Muted>
      </Service>

      <Service index={5} icon="flash-outline" color={C.accent} title="Zapier · Make (5,000+ apps)" sub="Send each new quote, signature, invoice and payment to a link">
        <Muted style={{ fontSize: 13 }}>
          Connect Google Sheets, Gmail, Slack, your CRM and more. In Zapier: make a Zap with “Webhooks by Zapier → Catch Hook”, copy its link and paste it here. In Make: “Custom webhook”.
        </Muted>
        <Field label="Webhook link" value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://hooks.zapier.com/…" />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title="Save" style={{ flex: 1 }} onPress={saveUrl} />
          <Button kind="secondary" title={testing ? 'Sending…' : 'Send a test'} style={{ flex: 1 }} disabled={testing || !validHookUrl(url)} onPress={test} />
        </View>
        {result ? <Text style={{ color: result.startsWith('Sent') ? C.okInk : C.warnInk, fontSize: 13 }}>{result}</Text> : null}
        <Readout>Send these</Readout>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {HOOK_EVENTS.map((e) => {
            const on = conn.events.includes(e.id);
            return <Chip key={e.id} label={e.label} selected={on}
              onPress={() => saveConnections({ ...conn, events: on ? conn.events.filter((x) => x !== e.id) : [...conn.events, e.id] })} />;
          })}
        </View>
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: conn.includeCosts }} onPress={() => saveConnections({ ...conn, includeCosts: !conn.includeCosts })}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
          <Ionicons name={conn.includeCosts ? 'checkbox' : 'square-outline'} size={22} color={conn.includeCosts ? C.accent : C.muted} />
          <Text style={{ color: C.ink2, flex: 1, fontSize: 14 }}>Also send my costs and markup (private: only if the link goes to your own sheet)</Text>
        </Pressable>
        <Banner tone="info" title="What is sent">Job name, client name and address, prices and totals, and what happened. Only to the link you paste.</Banner>
      </Service>

      <Service index={6} icon="cloud-outline" color="#94A3B8" title="Google Drive · Dropbox · iCloud" sub="PDFs and backups">
        <Muted style={{ fontSize: 13 }}>Every PDF (quotes, invoices, work orders) opens the share sheet: pick Drive, Dropbox or Files to save it there. A full backup is in Settings.</Muted>
        <Button kind="ghost" title="Back up all data" onPress={() => router.push('/settings')} />
      </Service>
    </Screen>
  );
}

function Service({ icon, color, title, sub, children, index }: { icon: IconName; color: string; title: string; sub: string; children: React.ReactNode; index: number }) {
  return (
    <Reveal index={index}>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 42, height: 42, borderWidth: 1, borderColor: C.line, backgroundColor: C.cardHi, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={icon} size={22} color={color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.ink, fontWeight: '700', fontSize: 16 }}>{title}</Text>
            <Text style={{ color: C.muted, fontSize: 12 }}>{sub}</Text>
          </View>
        </View>
        {children}
      </Card>
    </Reveal>
  );
}
