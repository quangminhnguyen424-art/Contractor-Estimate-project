import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { useCloud } from './CloudProvider';
import { getMyPlan, type MyPlan } from './plan';

/** The signed-in account's plan; read again whenever the app comes back to the front (e.g. after Stripe checkout). */
export function useMyPlan() {
  const cloud = useCloud();
  const userId = cloud.user?.id ?? null;
  const [read, setRead] = useState<{ user: string; plan: MyPlan | null } | null>(null);
  const refresh = useCallback(() => {
    if (!userId) return;
    void getMyPlan().then((plan) => setRead({ user: userId, plan }));
  }, [userId]);
  useEffect(() => {
    if (!userId) return;
    let live = true;
    const load = () => { void getMyPlan().then((plan) => { if (live) setRead({ user: userId, plan }); }); };
    load();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') load(); });
    return () => { live = false; sub.remove(); };
  }, [userId]);
  // undefined = still checking; null = no plan info (signed out, offline, or plans not set up on the server).
  const plan: MyPlan | null | undefined = !userId ? null : read?.user === userId ? read.plan : undefined;
  return { plan, refresh };
}
