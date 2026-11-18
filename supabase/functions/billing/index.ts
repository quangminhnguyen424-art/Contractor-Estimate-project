// Plans and payments for the signed-in account, through Stripe:
//   {action:'checkout', plan:'starter'|'pro'|'team'} → a Stripe Checkout page: card first, 14 days free (first time only),
//     then the plan's monthly price unless cancelled. Returns {url}.
//   {action:'portal'} → Stripe's billing page to change plan, update the card or cancel. Returns {url}.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { cors, json } from '../_shared/http.ts';
import { PRICES, stripe, stripeReady } from '../_shared/stripe.ts';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Where Stripe sends people back (the web app; the phone app checks the plan again when it comes back to the front).
const RETURN_URL = Deno.env.get('BILLING_RETURN_URL') ?? 'https://quangminhnguyen424-art.github.io/Contractor-Estimate-project/app/plan';
const TRIAL_DAYS = 14;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!stripeReady()) return json({ error: 'Payments are not set up yet.' }, 503);
  const userClient = createClient(URL_, ANON, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: 'Please sign in again.' }, 401);

  let body: { action?: string; plan?: string };
  try { body = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }
  const admin = createClient(URL_, SERVICE);
  await admin.from('plans').upsert({ user_id: user.id }, { onConflict: 'user_id', ignoreDuplicates: true });
  const { data: row } = await admin.from('plans').select('*').eq('user_id', user.id).single();

  try {
    // One Stripe customer per account.
    let customer = row?.stripe_customer_id as string | null;
    if (!customer) {
      const c = await stripe<{ id: string }>('POST', 'customers', { email: user.email, metadata: { user_id: user.id } });
      customer = c.id;
      await admin.from('plans').update({ stripe_customer_id: customer, updated_at: new Date().toISOString() }).eq('user_id', user.id);
    }

    if (body.action === 'portal') {
      const s = await stripe<{ url: string }>('POST', 'billing_portal/sessions', { customer, return_url: RETURN_URL });
      return json({ url: s.url });
    }

    if (body.action === 'checkout') {
      const price = PRICES[body.plan ?? ''];
      if (!price) return json({ error: 'Pick Starter, Pro or Team.' }, 400);
      // Already subscribed: change or cancel on the billing page instead of a second subscription.
      if (row?.stripe_subscription_id && ['trialing', 'active', 'past_due'].includes(row.status)) {
        const s = await stripe<{ url: string }>('POST', 'billing_portal/sessions', { customer, return_url: RETURN_URL });
        return json({ url: s.url, portal: true });
      }
      const trial = !row?.had_trial;
      const s = await stripe<{ url: string }>('POST', 'checkout/sessions', {
        mode: 'subscription',
        customer,
        client_reference_id: user.id,
        line_items: [{ price, quantity: 1 }],
        payment_method_collection: 'always',
        allow_promotion_codes: true,
        subscription_data: {
          metadata: { user_id: user.id },
          ...(trial ? { trial_period_days: TRIAL_DAYS, trial_settings: { end_behavior: { missing_payment_method: 'cancel' } } } : {}),
        },
        success_url: `${RETURN_URL}?checkout=done`,
        cancel_url: `${RETURN_URL}?checkout=cancel`,
      });
      return json({ url: s.url });
    }
    return json({ error: 'Bad request' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Payments did not answer. Try again.' }, 502);
  }
});
