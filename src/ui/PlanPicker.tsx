import Ionicons from '@expo/vector-icons/Ionicons';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { firstChargeDate, openBillingPortal, PLANS, startCheckout, trialDaysLeft, yearPrice, type Interval, type MyPlan, type PaidPlan } from '@/cloud/plan';
import { Button, C, Card, H2, Muted } from '@/ui/kit';
import { Text } from '@/ui/text';

const day = (d: Date | string) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

async function openPage(url: string) {
  if (Platform.OS === 'web') { window.location.href = url; return; }
  await WebBrowser.openBrowserAsync(url);
}

/** Pick Starter, Pro or Team. Card first; nothing is charged for 14 days (first time only), then monthly until cancelled. */
export function PlanPicker({ plan, onChanged }: { plan: MyPlan | null | undefined; onChanged: () => void }) {
  const [pick, setPick] = useState<PaidPlan>('pro');
  const [interval, setInterval_] = useState<Interval>('year');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const trial = !plan?.had_trial;
  const chosen = PLANS.find((p) => p.id === pick)!;
  const yearly = interval === 'year';
  const amount = yearly ? yearPrice(chosen.price) : chosen.price;
  const paid = plan && ['starter', 'pro', 'team'].includes(plan.plan);

  const go = async (fn: () => Promise<{ url: string }>) => {
    setBusy(true); setErr(null);
    try { await openPage((await fn()).url); onChanged(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Something went wrong. Try again.'); }
    finally { setBusy(false); }
  };

  if (paid && plan) {
    const name = PLANS.find((p) => p.id === plan.plan)?.name ?? plan.plan;
    const line = plan.status === 'trialing' && plan.trial_ends_at
      ? (plan.cancel_at_period_end ? `Free trial: ${trialDaysLeft(plan)} days left. Cancelled, so you won't be charged.` : `Free trial: ${trialDaysLeft(plan)} days left. First charge on ${day(plan.trial_ends_at)}.`)
      : plan.status === 'past_due' ? 'Your last payment did not go through. Update your card to keep Studwise AI.'
      : plan.cancel_at_period_end && plan.paid_until ? `Cancelled. Studwise AI stays on until ${day(plan.paid_until)}.`
      : plan.paid_until ? `Renews on ${day(plan.paid_until)}.` : '';
    return (
      <View style={{ gap: 12 }}>
        <Card style={{ gap: 4 }}>
          <Muted style={{ fontSize: 13 }}>Your plan</Muted>
          <Text style={{ color: C.ink, fontSize: 22, fontWeight: '800' }}>{name}</Text>
          {!!line && <Text style={{ color: plan.status === 'past_due' ? C.warnInk : C.ink2 }}>{line}</Text>}
        </Card>
        <Button title="Change plan, card or cancel" icon="card-outline" disabled={busy} onPress={() => go(openBillingPortal)} />
        <Muted style={{ fontSize: 12 }}>Opens Stripe, our payment company. Cancel any time; you keep your plan until the end of the period you paid for.</Muted>
        {!!err && <Text style={{ color: '#B42318' }}>{err}</Text>}
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', backgroundColor: C.cardHi, borderRadius: 12, padding: 4, gap: 4 }}>
        {(['month', 'year'] as const).map((iv) => {
          const on = iv === interval;
          return (
            <Pressable key={iv} onPress={() => setInterval_(iv)} accessibilityRole="radio" accessibilityState={{ checked: on }}
              style={{ flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center', backgroundColor: on ? C.card : 'transparent' }}>
              <Text style={{ color: on ? C.ink : C.ink2, fontWeight: '700' }}>{iv === 'month' ? 'Monthly' : 'Yearly · save 20%'}</Text>
            </Pressable>
          );
        })}
      </View>
      {PLANS.map((p) => {
        const on = p.id === pick;
        return (
          <Pressable key={p.id} onPress={() => setPick(p.id)} accessibilityRole="radio" accessibilityState={{ checked: on }}>
            <Card style={{ gap: 8, borderWidth: on ? 2 : 1, borderColor: on ? C.accent : C.line }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? C.accent : C.ink2} />
                <H2 style={{ flex: 1 }}>{p.name}</H2>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: on ? C.accent : C.ink, fontWeight: '800', fontSize: 17 }}>{yearly ? `$${yearPrice(p.price)} / year` : `$${p.price} / month`}</Text>
                  {yearly && <Text style={{ color: C.ink2, fontSize: 12 }}>{`$${(yearPrice(p.price) / 12).toFixed(2)} a month, billed yearly`}</Text>}
                </View>
              </View>
              {p.items.map((t) => (
                <View key={t} style={{ flexDirection: 'row', gap: 8, paddingLeft: 32 }}>
                  <Ionicons name="checkmark" size={16} color={C.okInk} />
                  <Text style={{ color: C.ink2, flex: 1, lineHeight: 20 }}>{t}</Text>
                </View>
              ))}
            </Card>
          </Pressable>
        );
      })}
      <Button
        title={trial ? 'Start 14 days free' : `Subscribe to ${chosen.name}`}
        icon="lock-closed"
        disabled={busy}
        onPress={() => go(() => startCheckout(pick, interval))}
      />
      <Muted style={{ fontSize: 12, lineHeight: 18 }}>
        {trial
          ? (yearly
            ? `A card is needed to start. You pay nothing today. On ${day(firstChargeDate())} your card is charged $${amount} for the year, then $${amount} every year until you cancel. Cancel before then and you pay nothing: Me → Your plan. Payment is handled by Stripe; Studwise never sees your card number.`
            : `A card is needed to start. You pay nothing today. On ${day(firstChargeDate())} your card is charged $${amount}, then $${amount} every month until you cancel. Cancel before then and you pay nothing: Me → Your plan. Payment is handled by Stripe; Studwise never sees your card number.`)
          : (yearly
            ? `Your card is charged $${amount} today for the year, then every year until you cancel (Me → Your plan). Payment is handled by Stripe.`
            : `Your card is charged $${amount} today, then every month until you cancel (Me → Your plan). Payment is handled by Stripe.`)}
      </Muted>
      {!!err && <Text style={{ color: '#B42318' }}>{err}</Text>}
    </View>
  );
}
