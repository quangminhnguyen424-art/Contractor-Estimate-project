// Deletes the signed-in account and everything in it (Apple requires apps with accounts to offer this).
import { createClient } from 'npm:@supabase/supabase-js@2';

import { cors, json } from '../_shared/http.ts';
import { stripe, stripeReady } from '../_shared/stripe.ts';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const userClient = createClient(URL_, ANON, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: 'Please sign in again.' }, 401);
  const admin = createClient(URL_, SERVICE);
  // Stop any subscription first, so a deleted account is never charged again.
  const { data: plan } = await admin.from('plans').select('stripe_subscription_id, status').eq('user_id', user.id).maybeSingle();
  if (stripeReady() && plan?.stripe_subscription_id && plan.status !== 'canceled') {
    try { await stripe('DELETE', `subscriptions/${plan.stripe_subscription_id}`); } catch { return json({ error: 'Could not cancel your subscription. Try again, or email billing.' }, 502); }
  }
  // Photos first (storage isn't removed with the account), page by page.
  for (let i = 0; i < 100; i++) {
    const { data: files } = await admin.storage.from('photos').list(user.id, { limit: 1000 });
    if (!files?.length) break;
    await admin.storage.from('photos').remove(files.map((f) => `${user.id}/${f.name}`));
  }
  const { error } = await admin.auth.admin.deleteUser(user.id); // rows are removed with it (on delete cascade)
  if (error) return json({ error: 'Could not delete the account. Try again.' }, 500);
  return json({ ok: true });
});
