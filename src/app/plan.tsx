import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';

import { useCloud } from '@/cloud/CloudProvider';
import { getMyPlan, trialDaysLeft, type MyPlan } from '@/cloud/plan';
import { COMPANY } from '@/engine/company';
import { Button, C, Card, H2, Muted, Screen } from '@/ui/kit';
import { Text } from '@/ui/text';

const FREE = ['Quick price and the job questions, by hand', 'Quotes, contracts and invoices as PDF', 'Clients sign on your phone or by link', 'Job site photos and schedule'];
const PRO = ['Everything in Free', 'Studwise AI: talk or type the job and it builds the estimate', 'Studwise writes the scope of work, client messages and permit descriptions', 'Quotes and contracts in your client’s language', 'Ask Studwise anything, read receipts, crew work orders in their language'];

/** Your plan: what you have now, what Free and Pro include, and how to upgrade. */
export default function PlanScreen() {
  const cloud = useCloud();
  const [plan, setPlan] = useState<MyPlan | null | undefined>(undefined);
  useEffect(() => {
    if (!cloud.user) return;
    let live = true;
    getMyPlan().then((p) => { if (live) setPlan(p); });
    return () => { live = false; };
  }, [cloud.user]);

  const now = !cloud.user ? 'Log in to see your plan'
    : plan === undefined ? 'Checking…'
    : plan === null ? 'Pro features are open to everyone during the beta'
    : plan.plan === 'trial' ? `Pro trial: ${trialDaysLeft(plan)} days left`
    : plan.plan === 'free' ? 'Free plan'
    : plan.plan === 'team' ? 'Team' : 'Pro';

  return (
    <Screen>
      <Text style={{ color: C.ink, fontSize: 24, fontWeight: '800', letterSpacing: -0.3 }}>Your plan</Text>
      <Card style={{ gap: 4 }}>
        <Muted style={{ fontSize: 13 }}>Now</Muted>
        <Text style={{ color: C.ink, fontSize: 20, fontWeight: '800' }}>{now}</Text>
      </Card>
      <PlanCard title="Free" price="$0" items={FREE} />
      <PlanCard title="Pro" price="$39 / month" items={PRO} accent />
      <Muted style={{ fontSize: 13 }}>Every new account gets 14 days of Pro free. After that, Free keeps everything except the AI.</Muted>
      <Button title="Upgrade to Pro" icon="sparkles" onPress={() => Linking.openURL(`mailto:${COMPANY.billing}?subject=${encodeURIComponent('Upgrade to Studwise Pro')}`)} />
      <Muted style={{ fontSize: 12 }}>Online checkout is coming soon. Until then, email us and we turn Pro on for your account.</Muted>
    </Screen>
  );
}

function PlanCard({ title, price, items, accent }: { title: string; price: string; items: string[]; accent?: boolean }) {
  return (
    <Card style={{ gap: 8, borderWidth: accent ? 2 : 1, borderColor: accent ? C.accent : C.line }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <H2>{title}</H2>
        <Text style={{ color: accent ? C.accent : C.ink, fontWeight: '800', fontSize: 17 }}>{price}</Text>
      </View>
      {items.map((t) => (
        <View key={t} style={{ flexDirection: 'row', gap: 8 }}>
          <Ionicons name="checkmark-circle" size={18} color={accent ? C.accent : C.okInk} />
          <Text style={{ color: C.ink2, flex: 1, lineHeight: 20 }}>{t}</Text>
        </View>
      ))}
    </Card>
  );
}
