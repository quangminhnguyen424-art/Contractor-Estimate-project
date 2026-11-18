// A small Stripe client (no SDK): form-encoded calls with the secret key, which stays on the server.
const KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';

export const stripeReady = () => !!KEY;

/** Flattens {a: {b: 1}, c: [x]} into Stripe's form keys a[b]=1, c[0]=x. */
function form(obj: Record<string, unknown>, prefix = '', out = new URLSearchParams()): URLSearchParams {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => (typeof item === 'object' ? form(item as Record<string, unknown>, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(item))));
    else if (typeof v === 'object') form(v as Record<string, unknown>, key, out);
    else out.append(key, String(v));
  }
  return out;
}

export async function stripe<T = Record<string, unknown>>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: body && method !== 'GET' ? form(body).toString() : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? `Stripe ${res.status}`);
  return data as T;
}

/** The three plans, monthly and yearly, and their Stripe prices (set as secrets after creating the products in Stripe). */
export type Interval = 'month' | 'year';
export const PRICES: Record<string, Record<Interval, string>> = {
  starter: { month: Deno.env.get('STRIPE_PRICE_STARTER') ?? '', year: Deno.env.get('STRIPE_PRICE_STARTER_YEAR') ?? '' },
  pro: { month: Deno.env.get('STRIPE_PRICE_PRO') ?? '', year: Deno.env.get('STRIPE_PRICE_PRO_YEAR') ?? '' },
  team: { month: Deno.env.get('STRIPE_PRICE_TEAM') ?? '', year: Deno.env.get('STRIPE_PRICE_TEAM_YEAR') ?? '' },
};
export const planForPrice = (priceId: string) =>
  Object.entries(PRICES).find(([, p]) => priceId && (p.month === priceId || p.year === priceId))?.[0] ?? null;
