// Studwise AI: passes the app's requests to Claude with the owner's key, which never leaves the server.
// Only signed-in accounts can use it, each with a daily limit, a fixed model and a cap on answer length.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { cors, json } from '../_shared/http.ts';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const MODEL = Deno.env.get('AI_MODEL') ?? 'claude-sonnet-5-5';
const DAILY_LIMIT = Number(Deno.env.get('AI_DAILY_LIMIT') ?? '40');
// All accounts together per day (0 = no cap). Set it from the monthly AI budget: budget ÷ 30 ÷ cost per request.
const TOTAL_LIMIT = Number(Deno.env.get('AI_TOTAL_DAILY_LIMIT') ?? '0');
// Plans: when on, accounts on the Free plan (trial over, not paying) get no AI. Off during the beta.
const PLANS_ON = (Deno.env.get('PLANS_ON') ?? '0') === '1';
const TIMEOUT_MS = 90_000;
const MAX_BODY = 14_000_000; // up to 8 resized photos

type Msg = { role: 'user' | 'assistant'; content: unknown };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!KEY) return json({ error: 'The AI key is not set on the server yet.' }, 503);

  const userClient = createClient(URL_, ANON, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: 'Please sign in again.' }, 401);

  const text = await req.text();
  if (text.length > MAX_BODY) return json({ error: 'Too much to send at once. Try fewer photos.' }, 413);
  let body: { system?: unknown; messages?: unknown; max_tokens?: unknown };
  try { body = JSON.parse(text); } catch { return json({ error: 'Bad request' }, 400); }
  const system = typeof body.system === 'string' ? body.system.slice(0, 60_000) : '';
  const messages = Array.isArray(body.messages) ? (body.messages as Msg[]).filter((m) => m && (m.role === 'user' || m.role === 'assistant')).slice(-24) : [];
  if (!messages.length || messages[messages.length - 1].role !== 'user') return json({ error: 'Bad request' }, 400);
  const maxTokens = Math.max(5, Math.min(4000, Number(body.max_tokens) || 1500));

  const admin = createClient(URL_, SERVICE);
  if (PLANS_ON) {
    const plan = await admin.rpc('plan_for', { p_user: user.id });
    if (!plan.error && plan.data === 'free') {
      return json({ error: 'Studwise AI is part of Pro. Your free plan keeps everything else: Quick price, quotes, signing and invoices.', code: 'free_plan' }, 402);
    }
  }
  // The capped check (per user and for everyone) once its migration is in; the per-user one before that.
  let check = await admin.rpc('use_ai_capped', { p_user: user.id, p_limit: DAILY_LIMIT, p_total_limit: TOTAL_LIMIT });
  if (check.error) check = await admin.rpc('use_ai', { p_user: user.id, p_limit: DAILY_LIMIT });
  if (check.error) return json({ error: 'Usage check failed. Try again.' }, 500);
  if (!check.data) return json({ error: `Today's AI limit is used up. It resets tomorrow.` }, 429);

  // Busy or overloaded (429, 529, 5xx): wait and try again, twice, before giving up.
  const payload = JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages });
  let res: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 1200 * attempt + Math.random() * 800));
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
        body: payload,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      res = null;
      continue;
    }
    if (res.status !== 429 && res.status !== 529 && res.status < 500) break;
  }
  if (!res) return json({ error: 'The AI did not answer in time. Try again.' }, 504);
  if (res.status === 429 || res.status === 529) return json({ error: 'The AI is very busy right now. Try again in a minute.' }, 503);
  return new Response(await res.text(), { status: res.status, headers: { ...cors, 'content-type': 'application/json' } });
});
