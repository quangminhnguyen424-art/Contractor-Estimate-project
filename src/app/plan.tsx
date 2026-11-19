import { useLocalSearchParams } from 'expo-router';

import { useCloud } from '@/cloud/CloudProvider';
import { useMyPlan } from '@/cloud/usePlan';
import { C, Card, Muted, Screen } from '@/ui/kit';
import { PlanPicker } from '@/ui/PlanPicker';
import { Text } from '@/ui/text';

/** Your plan: pick Starter, Pro or Team (14 days free), or manage, change or cancel through Stripe. */
export default function PlanScreen() {
  const cloud = useCloud();
  const { plan, refresh } = useMyPlan();
  const { checkout } = useLocalSearchParams<{ checkout?: string }>();
  return (
    <Screen>
      <Text style={{ color: C.ink, fontSize: 24, fontWeight: '800', letterSpacing: -0.3 }}>Your plan</Text>
      {checkout === 'done' && <Card><Text style={{ color: C.okInk, fontWeight: '700' }}>Thanks! Your plan is being turned on. It can take a few seconds.</Text></Card>}
      {!cloud.user ? <Muted>Log in to see your plan.</Muted>
        : plan === undefined ? <Muted>Checking…</Muted>
        : plan === null || plan.plan === 'beta' ? <Muted>{"Everything, AI included, is open to everyone during the beta. Plans start later; we'll tell you before anything is charged."}</Muted>
        : plan.team_member ? (
          <Card style={{ gap: 6 }}>
            <Text style={{ color: C.ink, fontSize: 20, fontWeight: '800' }}>{plan.plan === 'team' ? 'Team' : 'Free'}</Text>
            <Muted>{plan.plan === 'team'
              ? 'You are on your company’s Team plan. The owner of the account manages the plan and billing.'
              : 'Your company’s Team plan has ended, so Studwise AI is off. Ask the owner of the account to turn it back on.'}</Muted>
          </Card>
        ) : (
          <>
            {plan.plan === 'free' && <Muted>{"You're on Free: everything except Studwise AI. Pick a plan to turn AI back on."}</Muted>}
            <PlanPicker plan={plan} onChanged={refresh} />
          </>
        )}
    </Screen>
  );
}
