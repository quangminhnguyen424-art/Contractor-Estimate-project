// Runs the real receipts-in function against stand-ins for Supabase, Resend and Claude, and checks what it stores.
// Not deployed (nothing imports it). Run:  deno run -A supabase/functions/receipts-in/check.ts
const OWNER = '00000000-0000-4000-8000-00000000000a';
const KEYB = new TextEncoder().encode('a-secret-only-the-provider-knows');
const SECRET = 'whsec_' + btoa(String.fromCharCode(...KEYB));
Deno.env.set('SUPABASE_URL', 'https://sb.test'); Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service');
Deno.env.set('RESEND_WEBHOOK_SECRET', SECRET); Deno.env.set('RESEND_API_KEY', 're_x'); Deno.env.set('ANTHROPIC_API_KEY', 'sk-x');

type World = { on: boolean; mail: Record<string, unknown>; atts: Record<string, unknown>[]; reply: string; seen: Set<string>; seenCount: number };
const w: World = { on: true, mail: {}, atts: [], reply: '', seen: new Set(), seenCount: 1 };
let saved: Record<string, unknown>[] = []; let uploads: string[] = []; let asked: any = null; const calls: string[] = [];
const J = (b: unknown, status = 200, headers: Record<string, string> = {}) => new Response(status === 204 ? null : JSON.stringify(b), { status, headers: { 'content-type': 'application/json', ...headers } });
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const req = new Request(input as any, init); const u = new URL(req.url); const obj = (req.headers.get('accept') || '').includes('vnd.pgrst.object');
  calls.push(`${req.method} ${u.host}${u.pathname}`);
  if (u.host === 'sb.test') {
    if (u.pathname === '/rest/v1/app_settings') return J(obj ? { receipts_mail_on: w.on } : [{ receipts_mail_on: w.on }]);
    if (u.pathname === '/rest/v1/receipt_addresses') { const hit = u.searchParams.get('token') === 'eq.ab12cd34ef56'; return hit ? J(obj ? { owner: OWNER } : [{ owner: OWNER }]) : obj ? J({ code: 'PGRST116', message: 'no rows' }, 406) : J([]); }
    if (u.pathname === '/rest/v1/rpc/plan_for') return J('beta');
    if (u.pathname === '/rest/v1/receipt_mail_seen' && req.method === 'POST') { const b = await req.json(); if (w.seen.has(b.mail_id)) return J({ code: '23505', message: 'duplicate key' }, 409); w.seen.add(b.mail_id); return J(null, 201); }
    if (u.pathname === '/rest/v1/receipt_mail_seen') return new Response(null, { status: 200, headers: { 'content-range': `0-0/${w.seenCount}` } });
    if (u.pathname === '/rest/v1/receipt_mail' && req.method === 'POST') { const b = await req.json(); saved.push(...(Array.isArray(b) ? b : [b])); return J(null, 201); }
    if (u.pathname.startsWith('/storage/v1/object/photos/')) { uploads.push(u.pathname.replace('/storage/v1/object/', '')); return J({ Key: 'k', Id: 'i' }); }
  }
  if (u.host === 'api.resend.com') {
    if (u.pathname.endsWith('/attachments')) return J({ object: 'list', has_more: false, data: w.atts.map((a) => ({ ...a, download_url: `https://files.test/${a.id}` })) });
    return J({ ...w.mail, attachments: w.atts });
  }
  if (u.host === 'files.test') { const a = w.atts.find((x) => `/${x.id}` === u.pathname)!; return new Response(a.body as BodyInit); }
  if (u.host === 'api.anthropic.com') { asked = await req.json(); return J({ content: [{ type: 'text', text: w.reply }] }); }
  return J({ error: 'unexpected ' + req.url }, 500);
}) as typeof fetch;

let handler!: (r: Request) => Promise<Response>;
(Deno as any).serve = (h: any) => { handler = h; return {} as any; };
await import(Deno.args[0] ?? './index.ts');

async function deliver(id: string, to: string, opts: { badSig?: boolean } = {}) {
  saved = []; uploads = []; asked = null;
  const body = JSON.stringify({ type: 'email.received', created_at: new Date().toISOString(), data: { email_id: id, from: w.mail.from, to: [to], subject: w.mail.subject, attachments: w.atts.map(({ body: _b, ...a }) => a) } });
  const t = String(Math.floor(Date.now() / 1000));
  const key = await crypto.subtle.importKey('raw', KEYB, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`msg_${id}.${t}.${body}`)))));
  const res = await handler(new Request('https://fn.test/receipts-in', { method: 'POST', body, headers: { 'svix-id': `msg_${id}`, 'svix-timestamp': t, 'svix-signature': opts.badSig ? 'v1,AAAA' : `v1,${sig}` } }));
  return res.status;
}
let fails = 0; const ok = (name: string, cond: boolean, extra?: unknown) => { console.log(cond ? 'PASS' : 'FAIL', name, cond ? '' : JSON.stringify(extra)); if (!cond) fails++; };
const HD = { vendor: 'The Home Depot', date: '2026-11-20', tax: 8.2, total: 88.2, kind: 'materials', po: 'PO# 11752', receiptNo: '4829 00012 55501', refund: false, card: 'VISA 4242', lines: [{ name: 'Thinset 50 lb', qty: 2, unit: 'bag', total: 80 }] };
const ADDR = 'r-ab12cd34ef56@in.studwise.ai';

// 1. A call that is not signed by the provider.
w.mail = { from: 'x@y.com', subject: 's', html: '<p>hi</p>', text: '' };
ok('an unsigned call is refused and nothing is fetched', (await deliver('m0', ADDR, { badSig: true })) === 400 && calls.length === 0);

// 2. An e-receipt in the body of a mail.
w.mail = { from: 'HomeDepot <HomeDepot@order.homedepot.com>', subject: 'Your Home Depot receipt', text: '', html: '<table><tr><td>Thinset 50 lb</td><td>$80.00</td></tr><tr><td>PO/Job Name</td><td>11752</td></tr><tr><td>VISA ****4242</td></tr></table>' };
w.atts = []; w.reply = '```json\n' + JSON.stringify(HD) + '\n```';
let st = await deliver('m1', ADDR);
ok('an e-receipt is read and saved once', st === 200 && saved.length === 1 && saved[0].owner === OWNER && saved[0].kind === 'email' && (saved[0].read as any).total === 88.2 && saved[0].photo === null, saved);
ok('the reader was given the receipt text and the mail prompt', asked?.system.includes('"purchases"') && JSON.stringify(asked.messages).includes('PO/Job Name 11752'));
ok('no card detail is saved', !JSON.stringify(saved).includes('4242'), saved);
ok('card digits on the e-receipt are blanked before the reader sees the text', !JSON.stringify(asked.messages).includes('4242') && JSON.stringify(asked.messages).includes('VISA [card]'));
ok('the mail itself is not stored', uploads.length === 0);

// 3. The provider delivers the same mail again.
st = await deliver('m1', ADDR);
ok('a repeated delivery saves nothing', st === 200 && saved.length === 0 && asked === null);

// 4. A photo of a paper receipt.
w.mail = { from: 'Crew <crew@gmail.com>', subject: '11752', text: 'Sent from my iPhone', html: '' };
w.atts = [{ id: 'att1', filename: 'IMG_0001.jpeg', content_type: 'image/jpeg', content_disposition: 'inline', size: 200_000, body: new Uint8Array(200_000).fill(7) }];
w.reply = JSON.stringify({ ...HD, po: '', receiptNo: '77' });
st = await deliver('m2', `Studwise <${ADDR.toUpperCase().replace('R-', 'r-')}>`);
ok('a photo is read as a picture', asked?.messages[0].content[0].type === 'image' && asked.messages[0].content[0].source.media_type === 'image/jpeg' && asked.messages[0].content[0].source.data.length > 200_000);
ok('the photo is kept in the company photo folder and named on the row', uploads.length === 1 && uploads[0].startsWith(`photos/${OWNER}/`) && /^[\w-]+\.jpg$/.test(String(saved[0]?.photo)) && uploads[0].endsWith(String(saved[0].photo)), { uploads, saved });

// 5. A store purchase-history file with two purchases.
w.mail = { from: 'me@gmail.com', subject: 'purchase history', text: 'see attached', html: '' };
w.atts = [{ id: 'att2', filename: 'Purchase_History.csv', content_type: 'application/octet-stream', content_disposition: 'attachment', size: 300, body: 'Date,Store,Job Name,Total\n2026-11-01,HD,11752,50\n2026-11-02,HD,1241,60\n' }];
w.reply = JSON.stringify({ purchases: [{ ...HD, receiptNo: 'A1', total: 50 }, { ...HD, receiptNo: 'A2', total: 60 }] });
st = await deliver('m3', ADDR);
ok('a store file becomes one row per purchase', saved.length === 2 && saved.every((r) => r.kind === 'file') && saved.map((r) => r.part).join() === '0,1' && uploads.length === 0, saved);
ok('the reader was given the file text', JSON.stringify(asked.messages).includes('2026-11-02,HD,1241,60'));

// 6. An ad.
w.mail = { from: 'deals@store.com', subject: '(#409483493) Gmail Forwarding Confirmation', text: 'confirm', html: '' }; w.atts = []; w.reply = '{"notReceipt": true}';
st = await deliver('m4', ADDR);
ok('mail with no receipt is saved as unread with its subject, so it is seen', saved.length === 1 && saved[0].read === null && String(saved[0].subject).startsWith('(#409483493)'), saved);

// 7. Mail for an address nobody has, and mail while the switch is off.
st = await deliver('m5', 'r-zzzzzzzzzzzz@in.studwise.ai');
ok('mail to an unknown address is dropped', st === 200 && saved.length === 0 && asked === null);
st = await deliver('m6', 'hello@in.studwise.ai');
ok('mail to another address is dropped', st === 200 && saved.length === 0);
w.on = false; st = await deliver('m7', ADDR); w.on = true;
ok('nothing is read while mail-in is switched off', st === 200 && saved.length === 0 && asked === null);

// 8. Too many in a day.
w.seenCount = 31; w.reply = JSON.stringify(HD); w.mail = { from: 'a@b.c', subject: 's', text: 'Total 88.20', html: '' };
st = await deliver('m8', ADDR); w.seenCount = 1;
ok('past the daily limit nothing is read', st === 200 && saved.length === 0 && asked === null);
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); Deno.exit(fails ? 1 : 0);
