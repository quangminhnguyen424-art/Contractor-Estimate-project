// Receipts by mail. A store's e-receipt, a purchase-history file or a photo of a paper receipt is mailed to a
// company's address (r-<code>@in.studwise.ai). Resend receives it and calls this function, which finds the company,
// lets Claude read the purchase, and saves what was read for the company's phones to pick up.
//
// What is kept: store, date, items, amounts, receipt number, the job name / PO, the sender and subject of the mail,
// and the photo when the mail was a photo. What is not: the mail itself, and anything about how it was paid.
//
// Deploy with --no-verify-jwt (the mail provider calls it, not a signed-in user); every call is checked with the
// webhook's signing secret. Secrets: RESEND_WEBHOOK_SECRET, RESEND_API_KEY, ANTHROPIC_API_KEY (already set for `ai`).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { htmlToText, mailPrompt, pickAttachment, purchasesFrom, tokenFrom, verifySvix, whyRefused, withoutCardDigits, type MailAttachment, type Picked } from '../_shared/receiptMail.ts';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SECRET = Deno.env.get('RESEND_WEBHOOK_SECRET') ?? '';
const RESEND = Deno.env.get('RESEND_API_KEY') ?? '';
const KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const MODEL = Deno.env.get('AI_MODEL') ?? 'claude-sonnet-5-5';
/** Mails read per company address per day. A crew buys a few times a day; more than this is a loop or abuse. */
const DAILY_MAILS = Number(Deno.env.get('RECEIPT_MAILS_PER_DAY') ?? '30');
const PLANS_WITH_MAIL = ['pro', 'team', 'beta'];

type Received = {
  email_id?: string; from?: string; to?: string[]; cc?: string[]; bcc?: string[]; received_for?: string[]; subject?: string;
  attachments?: MailAttachment[];
};
type Block = Record<string, unknown>;

const ok = (why: string) => new Response(why, { status: 200 });

async function resend(path: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`https://api.resend.com${path}`, { headers: { Authorization: `Bearer ${RESEND}` }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
  return res?.ok ? (await res.json().catch(() => null)) as Record<string, unknown> | null : null;
}

function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** The picked attachment's bytes, from the short-lived link the provider gives. */
async function attachmentBytes(mailId: string, pick: Picked): Promise<Uint8Array | null> {
  const list = await resend(`/emails/receiving/${mailId}/attachments`);
  const item = (Array.isArray(list?.data) ? list.data as Record<string, unknown>[] : []).find((a) => a.id === pick.id);
  const url = typeof item?.download_url === 'string' ? item.download_url : '';
  if (!url.startsWith('https://')) return null;
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) }).catch(() => null);
  if (!res?.ok) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  return bytes.length && bytes.length <= 10_000_000 ? bytes : null;
}

/** Claude's answer for one mail, or null when it could not be asked. Busy or overloaded: wait and try again, twice. */
async function ask(content: Block[]): Promise<string | null> {
  const payload = JSON.stringify({ model: MODEL, max_tokens: 8000, system: mailPrompt(), messages: [{ role: 'user', content }] });
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 1500 * attempt));
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
      body: payload, signal: AbortSignal.timeout(110_000),
    }).catch(() => null);
    if (!res || res.status === 429 || res.status >= 500) continue;
    if (!res.ok) return null;
    const out = await res.json().catch(() => null) as { content?: { type: string; text?: string }[] } | null;
    return (out?.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('') || null;
  }
  return null;
}

async function handle(admin: SupabaseClient, mail: Received): Promise<string> {
  const mailId = typeof mail.email_id === 'string' ? mail.email_id : '';
  const token = tokenFrom([...(mail.to ?? []), ...(mail.received_for ?? []), ...(mail.cc ?? []), ...(mail.bcc ?? [])]);
  if (!mailId || !token) return 'not a receipts address';

  const { data: settings } = await admin.from('app_settings').select('receipts_mail_on').maybeSingle();
  if (!settings?.receipts_mail_on) return 'mail-in is off';
  const { data: addr } = await admin.from('receipt_addresses').select('owner').eq('token', token).maybeSingle();
  const owner = addr?.owner as string | undefined;
  if (!owner) return 'unknown address';
  const plan = await admin.rpc('plan_for', { p_user: owner });
  if (!PLANS_WITH_MAIL.includes(plan.error ? 'beta' : String(plan.data))) return 'not on this plan';

  // First come, only served: a delivery the provider repeats finds the mail already claimed.
  const claim = await admin.from('receipt_mail_seen').insert({ mail_id: mailId, owner });
  if (claim.error) return 'already taken';
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await admin.from('receipt_mail_seen').select('mail_id', { count: 'exact', head: true }).eq('owner', owner).gte('at', since);
  if ((count ?? 0) > DAILY_MAILS) return 'over the daily limit';

  const from = (mail.from ?? '').slice(0, 200);
  const subject = (mail.subject ?? '').slice(0, 200);
  const unread = async (why: string) => {
    await admin.from('receipt_mail').insert({ owner, mail_id: mailId, part: 0, kind: 'email', read: null, mail_from: from, subject });
    return why;
  };

  const full = await resend(`/emails/receiving/${mailId}`);
  if (!full) return unread('could not fetch the mail');
  // Card digits printed on an e-receipt are blanked before the text goes anywhere.
  const bodyText = withoutCardDigits((typeof full.text === 'string' && full.text.trim() ? full.text : htmlToText(typeof full.html === 'string' ? full.html : '')).slice(0, 40_000));
  const pick = pickAttachment((Array.isArray(full.attachments) ? full.attachments : mail.attachments ?? []) as MailAttachment[]);
  const bytes = pick ? await attachmentBytes(mailId, pick) : null;

  const content: Block[] = [];
  if (pick && bytes && pick.as === 'image') content.push({ type: 'image', source: { type: 'base64', media_type: pick.mime, data: base64(bytes) } });
  if (pick && bytes && pick.as === 'pdf') content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64(bytes) } });
  if (pick && bytes && pick.as === 'text') {
    const fileText = new TextDecoder().decode(bytes);
    content.push({ type: 'text', text: `The attached file:\n${withoutCardDigits((pick.mime === 'text/html' ? htmlToText(fileText, 120_000) : fileText).slice(0, 120_000))}` });
  }
  if (!content.length && !bodyText.trim()) return unread('nothing to read');
  content.push({ type: 'text', text: `The email. Subject: ${subject}\n${bodyText}` });

  const reply = KEY ? await ask(content) : null;
  const { reads } = reply ? purchasesFrom(reply) : { reads: [] };
  if (!reads.length) return unread(reply ? 'no receipt in it' : 'the reader did not answer');

  // A photo of a paper receipt is kept beside the cost, like one snapped in the app. E-receipts and files are not kept.
  let photo: string | null = null;
  if (pick && bytes && pick.mime === 'image/jpeg' && reads.length === 1) {
    const name = `${crypto.randomUUID()}.jpg`;
    const up = await admin.storage.from('photos').upload(`${owner}/${name}`, bytes, { contentType: 'image/jpeg', upsert: false });
    if (!up.error) photo = name;
  }
  const kind = reads.length > 1 || pick?.as === 'text' ? 'file' : 'email';
  const { error } = await admin.from('receipt_mail').insert(reads.map((read, part) => ({
    owner, mail_id: mailId, part, kind, read, mail_from: from, subject, photo: part === 0 ? photo : null,
  })));
  return error ? 'could not save' : `saved ${reads.length}`;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });
  const payload = await req.text();
  const headers = { id: req.headers.get('svix-id'), timestamp: req.headers.get('svix-timestamp'), signature: req.headers.get('svix-signature') };
  const signed = await verifySvix(SECRET, headers, payload, Date.now() / 1000);
  if (!signed) {
    console.warn('receipts-in refused a call:', whyRefused(SECRET, headers, Date.now() / 1000));
    return new Response('bad signature', { status: 400 });
  }
  let event: { type?: string; data?: Received };
  try { event = JSON.parse(payload); } catch { return ok('not json'); }
  if (event.type !== 'email.received' || !event.data) return ok('ignored');
  if (!RESEND) return ok('the mail key is not set');

  // Answer the provider now and read in the background: reading a receipt takes longer than it waits. Whatever
  // happens, the answer is 200, so mail that cannot be used is not delivered again and again.
  const work = handle(createClient(URL_, SERVICE), event.data).then((r) => console.log('receipts-in:', r)).catch((e) => console.error('receipts-in failed:', e instanceof Error ? e.message : e));
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(work); else await work;
  return ok('ok');
});
