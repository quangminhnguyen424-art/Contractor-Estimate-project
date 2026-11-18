// Stripe → Studwise: keeps public.plans in step with each subscription (trial started, paid, failed, changed, cancelled).
// Deploy with --no-verify-jwt (Stripe calls it, not a signed-in user); every call is checked with the webhook secret.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { planForPrice } from '../_shared/stripe.ts';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Stripe-Signature: t=…,v1=… ; HMAC-SHA256 of "t.payload" with the endpoint secret, within 5 minutes. */
async function verified(payload: string, header: string | null): Promise<boolean> {
  if (!SECRET || !header) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`)));
  const given = header.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  return given.some((g) => g.length === sig.length && [...g].every((c, i) => c === sig[i]));
}

type Sub = {
  id: string; status: string; customer: string; cancel_at_period_end: boolean; trial_end: number | null;
  current_period_end?: number; metadata?: { user_id?: string };
  items: { data: { price: { id: string }; current_period_end?: number }[] };
};
const ts = (s: number | null | undefined) => (s ? new Date(s * 1000).toISOString() : null);

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });
  const payload = await req.text();
  if (!(await verified(payload, req.headers.get('stripe-signature')))) return new Response('bad signature', { status: 400 });
  const event = JSON.parse(payload) as { type: string; data: { object: Record<string, unknown> } };
  const admin = createClient(URL_, SERVICE);

  if (event.type.startsWith('customer.subscription.')) {
    const sub = event.data.object as unknown as Sub;
    let userId = sub.metadata?.user_id;
    if (!userId) {
      const { data } = await admin.from('plans').select('user_id').eq('stripe_customer_id', sub.customer).maybeSingle();
      userId = data?.user_id;
    }
    if (!userId) return new Response('no account for this customer', { status: 200 });
    const item = sub.items?.data?.[0];
    const name = planForPrice(item?.price?.id ?? '');
    const live = ['trialing', 'active', 'past_due'].includes(sub.status) && event.type !== 'customer.subscription.deleted';
    await admin.from('plans').upsert({
      user_id: userId,
      plan: live && name ? name : 'free',
      status: event.type === 'customer.subscription.deleted' ? 'canceled' : sub.status,
      trial_ends_at: ts(sub.trial_end),
      paid_until: ts(sub.current_period_end ?? item?.current_period_end),
      cancel_at_period_end: !!sub.cancel_at_period_end,
      had_trial: true,
      stripe_customer_id: sub.customer,
      stripe_subscription_id: sub.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  }
  return new Response('ok', { status: 200 });
});
