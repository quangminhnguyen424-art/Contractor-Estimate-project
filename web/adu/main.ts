/**
 * The homeowner's "Can I build an ADU?" page (docs/adu.html). Built into docs/adu.js by scripts/build-adu-page.mjs.
 * One page per contractor: adu.html?c=<code> shows that contractor's name, contact and price range, and a homeowner
 * who asks for the full report becomes their lead (Supabase: get_adu_page, submit_adu_lead).
 */
import { aduCost, checkAdu, type AduResult } from '../../src/engine/adu';
import { aduRules, aduWords, type AduLang } from '../../src/engine/aduText';
import { findParcels, type Parcel } from '../../src/engine/parcel';

interface Page { company: string; phone: string; email: string; logo: string | null; lang: string; price_low: number | null; price_high: number | null }
interface Lot { address: string; pin: string; city: string; zoning: string; lotSqft: number; use: string; found: boolean }

const T = {
  en: {
    title: 'Can I build an ADU on my lot?', sub: 'Free ADU check',
    hero: 'Type your address. We read King County’s parcel records and Washington’s ADU rules, and show what you can build and about what it costs.',
    placeholder: '1234 Main St, Seattle', go: 'Check my lot', note: 'Works for homes in King County, WA. Free, no sign-up.',
    loading: 'Looking up your lot…', notFound: 'We couldn’t find that address in King County records. Check the spelling, or enter your city and lot size below.',
    offline: 'The county’s records didn’t answer. Try again in a moment, or enter your city and lot size below.',
    pickOne: 'Which one is your home?', manual: 'Not in King County, or know your lot already? Enter it here:', city: 'City', lot: 'Lot size (SF)', manualGo: 'Check with these',
    city_: 'City', zoning: 'Zoning', lotSize: 'Lot size', parcel: 'Parcel #', unincorporated: 'Unincorporated King County',
    canBuild: 'What you can build', adus: (n: number) => `${n} ADU${n === 1 ? '' : 's'} on this lot`, upTo: (sf: string) => `up to ${sf} SF each`,
    homes: (n: number) => `up to ${n} homes on the lot in total`, kind: 'Backyard cottage (DADU) or attached ADU',
    from: 'estimated', priceNote: (co: string) => `Estimated construction cost from ${co}’s current prices. Final price depends on design, site and finishes.`,
    noPrice: 'Ask for the full report to get a price for your lot.',
    gateTitle: 'Get your full report, free', gateText: (co: string) => `See the detailed rules for your lot, what to check before you design, all the costs, and the steps to build. ${co} will follow up to answer your questions.`,
    name: 'Your name', phone: 'Phone', email: 'Email', msg: 'Anything we should know? (optional)', msgPh: 'e.g. rent it out, a home for parents, start next spring',
    send: 'Show my full report', sending: 'Sending…', needName: 'Please add your name.', needContact: 'Please add a phone number or an email.',
    sendFail: 'Could not send. Check your connection and try again.', fineGate: (co: string) => `By sending, you agree that ${co} may call, text or email you about your project. No spam, no sharing.`,
    sent: (co: string) => `Thank you! ${co} has your request and will contact you soon.`,
    rules: 'The rules for your lot', checks: 'Check before you design', costTitle: 'What it costs', steps: 'How to build it',
    costs: (co: string, hasPrice: boolean) => [
      hasPrice ? `Construction: the ranges above, from ${co}’s prices.` : `Construction: ${co} will price your lot after a visit.`,
      'Design, survey and engineering: usually paid before the permit.',
      'Permit and plan review fees: set by your city from the project value.',
      'Utility connections: sewer, water and power. King County charges a monthly sewer capacity fee for 15 years for each new home.',
      'Site work: slopes, tree protection, long utility runs or rock can add cost.',
    ],
    stepList: (co: string) => [
      `Site visit with ${co}: measure the lot, look at utilities, access and trees.`,
      'Survey and design: plans that fit the setbacks, height and size limits.',
      'Permit: submit plans to the city (Seattle: SDCI) and answer any corrections.',
      'Build: foundation, framing, utilities, finishes, with city inspections along the way.',
      'Final inspection: the ADU is approved to live in or rent out.',
    ],
    print: 'Print or save as PDF', again: 'Check another address',
    fine: 'This is a first look from public records and state and city rules as of November 2026, not a permit decision or legal advice. Confirm with your city before you design or buy.',
    powered: 'ADU check by', call: 'Call', text: 'Text', emailBtn: 'Email', other: 'Tiếng Việt',
  },
  vi: {
    title: 'Lô đất của tôi xây ADU được không?', sub: 'Kiểm tra ADU miễn phí',
    hero: 'Nhập địa chỉ nhà. Chúng tôi đọc hồ sơ lô đất của King County và luật ADU của Washington, rồi cho bạn biết xây được gì và chi phí khoảng bao nhiêu.',
    placeholder: '1234 Main St, Seattle', go: 'Kiểm tra lô đất', note: 'Áp dụng cho nhà ở King County, WA. Miễn phí, không cần đăng ký.',
    loading: 'Đang tra lô đất của bạn…', notFound: 'Không tìm thấy địa chỉ này trong hồ sơ King County. Kiểm tra lại chính tả, hoặc nhập thành phố và diện tích lô bên dưới.',
    offline: 'Hệ thống của quận chưa trả lời. Thử lại sau giây lát, hoặc nhập thành phố và diện tích lô bên dưới.',
    pickOne: 'Nhà của bạn là địa chỉ nào?', manual: 'Không ở King County, hoặc đã biết lô đất? Nhập tại đây:', city: 'Thành phố', lot: 'Diện tích lô (SF)', manualGo: 'Kiểm tra với thông tin này',
    city_: 'Thành phố', zoning: 'Zoning', lotSize: 'Diện tích lô', parcel: 'Số parcel', unincorporated: 'Vùng không thuộc thành phố (King County)',
    canBuild: 'Bạn có thể xây', adus: (n: number) => `${n} ADU trên lô này`, upTo: (sf: string) => `mỗi căn tối đa ${sf} SF`,
    homes: (n: number) => `tổng cộng tối đa ${n} căn nhà trên lô`, kind: 'Nhà sau vườn (DADU) hoặc ADU nối với nhà',
    from: 'ước tính', priceNote: (co: string) => `Chi phí xây ước tính theo giá hiện tại của ${co}. Giá cuối cùng tùy thiết kế, địa hình và vật liệu hoàn thiện.`,
    noPrice: 'Nhận báo cáo đầy đủ để có giá cho lô đất của bạn.',
    gateTitle: 'Nhận báo cáo đầy đủ, miễn phí', gateText: (co: string) => `Xem quy định chi tiết cho lô của bạn, những điều cần kiểm tra trước khi thiết kế, tất cả chi phí và các bước để xây. ${co} sẽ liên hệ để giải đáp thắc mắc.`,
    name: 'Họ và tên', phone: 'Số điện thoại', email: 'Email', msg: 'Bạn muốn chúng tôi biết thêm gì? (không bắt buộc)', msgPh: 'vd: cho thuê, nhà cho bố mẹ, muốn bắt đầu mùa xuân tới',
    send: 'Xem báo cáo đầy đủ', sending: 'Đang gửi…', needName: 'Vui lòng nhập họ tên.', needContact: 'Vui lòng nhập số điện thoại hoặc email.',
    sendFail: 'Không gửi được. Kiểm tra kết nối rồi thử lại.', fineGate: (co: string) => `Khi gửi, bạn đồng ý để ${co} gọi, nhắn tin hoặc email cho bạn về dự án. Không spam, không chia sẻ thông tin.`,
    sent: (co: string) => `Cảm ơn bạn! ${co} đã nhận yêu cầu và sẽ sớm liên hệ.`,
    rules: 'Quy định cho lô của bạn', checks: 'Cần kiểm tra trước khi thiết kế', costTitle: 'Các khoản chi phí', steps: 'Các bước để xây',
    costs: (co: string, hasPrice: boolean) => [
      hasPrice ? `Xây dựng: khoảng giá ở trên, theo giá của ${co}.` : `Xây dựng: ${co} sẽ báo giá sau khi xem lô đất.`,
      'Thiết kế, đo đạc và kỹ sư kết cấu: thường trả trước khi xin permit.',
      'Phí permit và duyệt bản vẽ: thành phố tính theo giá trị công trình.',
      'Đấu nối cống, nước, điện. King County thu phí công suất cống hằng tháng trong 15 năm cho mỗi căn mới.',
      'Công việc mặt bằng: đất dốc, bảo vệ cây, đường ống dài hoặc đá có thể tăng chi phí.',
    ],
    stepList: (co: string) => [
      `${co} đến xem lô: đo đạc, xem đường điện nước, lối vào và cây.`,
      'Đo đạc và thiết kế: bản vẽ đúng khoảng lùi, chiều cao và diện tích cho phép.',
      'Xin permit: nộp bản vẽ cho thành phố (Seattle: SDCI) và sửa theo yêu cầu.',
      'Xây dựng: móng, khung, điện nước, hoàn thiện, có thanh tra thành phố kiểm tra từng giai đoạn.',
      'Nghiệm thu cuối: ADU được phép ở hoặc cho thuê.',
    ],
    print: 'In hoặc lưu PDF', again: 'Kiểm tra địa chỉ khác',
    fine: 'Đây là đánh giá sơ bộ từ hồ sơ công khai và luật tiểu bang, thành phố tính đến tháng 11/2026, không phải quyết định cấp phép hay tư vấn pháp lý. Hãy xác nhận với thành phố trước khi thiết kế hoặc mua.',
    powered: 'Kiểm tra ADU bởi', call: 'Gọi', text: 'Nhắn tin', emailBtn: 'Email', other: 'English',
  },
};

const $ = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as E;
const money = (n: number) => '$' + n.toLocaleString('en-US');
const num = (n: number) => n.toLocaleString('en-US');
const cfg = ((window as unknown as { BIDWELL_CLOUD?: { url: string; anonKey: string } }).BIDWELL_CLOUD) ?? { url: '', anonKey: '' };
const code = new URLSearchParams(location.search).get('c') ?? '';

let lang: AduLang = /^vi/i.test(navigator.language) ? 'vi' : 'en';
let page: Page | null = null;
let lot: Lot | null = null;
let result: AduResult | null = null;
let unlocked = false;
let sent = false;

const w = () => T[lang];
const co = () => page?.company?.trim() || (lang === 'vi' ? 'nhà thầu' : 'your contractor');
const perSf = () => (page?.price_low && page.price_high ? { low: Number(page.price_low), high: Number(page.price_high) } : null);

function rpc<R>(fn: string, body: unknown): Promise<R> {
  return fetch(`${cfg.url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}` },
    body: JSON.stringify(body),
  }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<R>; });
}

const ICON = {
  yes: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  likely: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  check: '<path d="M12 8v5M12 16.5v.01"/><circle cx="12" cy="12" r="9"/>',
  no: '<path d="M7 7l10 10M17 7L7 17"/>',
  call: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  text: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  email: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
};
const svg = (d: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function list(id: string, items: string[]) { const ul = $(id); ul.innerHTML = ''; items.forEach((t) => ul.appendChild(el('li', undefined, t))); }

// ── Words ──────────────────────────────────────────────────────────────────────────────────────────────────────
function words() {
  const t = w();
  document.documentElement.lang = lang;
  $('barSub').textContent = t.sub;
  $('heroTitle').textContent = t.title;
  $('heroText').textContent = t.hero;
  $<HTMLInputElement>('addr').placeholder = t.placeholder;
  $('goText').textContent = t.go;
  $('heroNote').textContent = t.note;
  $('loadingText').textContent = t.loading;
  $('manualText').textContent = t.manual;
  $('mCityLabel').textContent = t.city;
  $('mLotLabel').textContent = t.lot;
  $('mGo').textContent = t.manualGo;
  $('langBtn').textContent = t.other;
  $('gateTitle').textContent = t.gateTitle;
  $('gateText').textContent = t.gateText(co());
  $('lNameLabel').textContent = t.name;
  $('lPhoneLabel').textContent = t.phone;
  $('lEmailLabel').textContent = t.email;
  $('lMsgLabel').textContent = t.msg;
  $<HTMLTextAreaElement>('lMsg').placeholder = t.msgPh;
  $('lSendText').textContent = t.send;
  $('gateFine').textContent = page ? t.fineGate(co()) : '';
  $('rulesTitle').textContent = t.rules;
  $('checksTitle').textContent = t.checks;
  $('costTitle').textContent = t.costTitle;
  $('stepsTitle').textContent = t.steps;
  $('printText').textContent = t.print;
  $('again').textContent = t.again;
  $('fine').textContent = t.fine;
  const p = $('powered'); p.textContent = `${t.powered} `; p.appendChild(el('b', undefined, page?.company?.trim() || 'Bidwell AI'));
  document.title = `${t.title}${page?.company ? ` · ${page.company}` : ''}`;
  if (result) show();
}
$('langBtn').onclick = () => { lang = lang === 'en' ? 'vi' : 'en'; words(); };

// ── The contractor's page ────────────────────────────────────────────────────────────────────────────────────
function brand() {
  if (!page) return;
  $('barCo').textContent = page.company || 'Bidwell AI';
  const logo = $('logo');
  if (page.logo && /^data:image\/(png|jpe?g|webp|gif);base64,/.test(page.logo)) {
    const img = document.createElement('img'); img.src = page.logo; img.alt = ''; logo.innerHTML = ''; logo.appendChild(img);
  } else logo.textContent = (page.company || 'B').trim().charAt(0).toUpperCase() || 'B';
}

// ── Looking up the lot ─────────────────────────────────────────────────────────────────────────────────────────
function busy(on: boolean) { $('loading').hidden = !on; $<HTMLButtonElement>('go').disabled = on; }

function fromParcel(p: Parcel): Lot {
  return { address: p.address, pin: p.pin, city: p.city, zoning: p.zoning, lotSqft: p.lotSqft, use: p.use, found: true };
}

$('searchForm').onsubmit = async (e) => {
  e.preventDefault();
  const q = $<HTMLInputElement>('addr').value.trim();
  if (q.length < 5) return;
  $('searchErr').textContent = ''; $('pick').hidden = true; $('manual').hidden = true;
  busy(true);
  try {
    const found = await findParcels(q);
    if (!found.length) { $('searchErr').textContent = w().notFound; $('manual').hidden = false; return; }
    if (found.length === 1) { run(fromParcel(found[0])); return; }
    // Several matches (same street number in two cities): let them choose.
    const pick = $('pick'); pick.innerHTML = ''; pick.appendChild(el('div', 'note', w().pickOne));
    found.forEach((p) => {
      const b = el('button') as HTMLButtonElement; b.type = 'button';
      b.appendChild(el('b', undefined, p.address)); b.appendChild(el('span', undefined, `${p.city} · ${num(p.lotSqft)} SF`));
      b.onclick = () => run(fromParcel(p));
      pick.appendChild(b);
    });
    pick.hidden = false;
  } catch {
    $('searchErr').textContent = w().offline; $('manual').hidden = false;
  } finally { busy(false); }
};

$('mGo').onclick = () => {
  const city = $<HTMLInputElement>('mCity').value.trim();
  const sf = Number($<HTMLInputElement>('mLot').value);
  if (!city) { $<HTMLInputElement>('mCity').focus(); return; }
  run({ address: $<HTMLInputElement>('addr').value.trim(), pin: '', city, zoning: '', lotSqft: sf > 0 ? sf : 0, use: 'Single Family', found: false });
};

function run(l: Lot) {
  lot = l;
  result = checkAdu({ city: l.city, zoning: l.zoning, lotSqft: l.lotSqft, use: l.use });
  unlocked = !page; // without a contractor page there is no one to send a lead to: show everything
  sent = false;
  $('pick').hidden = true;
  show();
  $('result').hidden = false;
  $('searchCard').hidden = true;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── The result ───────────────────────────────────────────────────────────────────────────────────────────────
function show() {
  if (!result || !lot) return;
  const t = w(); const words_ = aduWords(lang); const r = result;
  const v = $('verdict'); v.className = `verdict v-${r.verdict}`;
  $('vIcon').innerHTML = svg(ICON[r.verdict]);
  $('vTitle').textContent = words_.verdict[r.verdict];
  const vt = $('vText'); vt.innerHTML = '';
  r.reasons.forEach((k) => vt.appendChild(el('p', undefined, words_.reason[k])));

  const facts = $('facts'); facts.innerHTML = '';
  const fact = (k: string, val: string) => { const f = el('div', 'fact'); f.appendChild(el('span', undefined, k)); f.appendChild(el('b', undefined, val)); facts.appendChild(f); };
  fact(t.city_, /^king county$/i.test(lot.city) ? t.unincorporated : lot.city);
  if (lot.zoning) fact(t.zoning, lot.zoning);
  if (lot.lotSqft) fact(t.lotSize, `${num(lot.lotSqft)} SF`);
  if (lot.pin) fact(t.parcel, lot.pin);

  const build = r.verdict === 'no' ? [] : r.sizes;
  $('buildTitle').hidden = !build.length;
  $('buildTitle').textContent = t.canBuild;
  const sum = [r.adus ? t.adus(r.adus) : '', r.maxSf ? t.upTo(num(r.maxSf)) : '', r.homes ? t.homes(r.homes) : ''].filter(Boolean);
  $('buildSum').textContent = sum.join(' · ');
  $('buildSum').hidden = !build.length || !sum.length;
  const sizes = $('sizes'); sizes.innerHTML = '';
  const prices = perSf();
  build.forEach((s) => {
    const row = el('div', 'size');
    const sf = el('div', 'sf'); sf.appendChild(el('b', undefined, num(s.sf))); sf.appendChild(el('span', undefined, 'SF')); row.appendChild(sf);
    const tx = el('div', 't'); tx.appendChild(el('b', undefined, words_.beds(s.beds))); tx.appendChild(el('span', undefined, t.kind)); row.appendChild(tx);
    const c = prices ? aduCost(s.sf, prices) : null;
    if (c) { const p = el('div', 'price', `${money(c.low)}–${money(c.high)}`); p.appendChild(el('small', undefined, t.from)); row.appendChild(p); }
    sizes.appendChild(row);
  });
  $('priceNote').textContent = build.length ? (prices ? t.priceNote(co()) : page ? t.noPrice : '') : '';

  // The full report: the rules, what to check, all the costs and the steps.
  list('rules', aduRules(r, lang));
  $('rulesCard').hidden = !r.rules.length;
  list('checks', r.checks.map((k) => words_.check[k]));
  list('costs', t.costs(co(), !!prices));
  list('steps', t.stepList(co()));
  contact();
  $('sentOk').textContent = t.sent(co()); $('sentOk').hidden = !sent;
  $('report').hidden = !unlocked;
  $('lockedCard').hidden = unlocked;
  $('gateCard').hidden = unlocked;
}

function contact() {
  const c = $('contact'); c.innerHTML = '';
  if (!page) { c.hidden = true; return; }
  const tel = (page.phone || '').replace(/[^0-9+]/g, '');
  const add = (k: 'call' | 'text' | 'email', href: string, label: string) => {
    const a = document.createElement('a'); a.href = href; a.innerHTML = svg(ICON[k]).replace('2.4', '2'); a.append(label); c.appendChild(a);
  };
  if (tel) { add('call', `tel:${tel}`, w().call); add('text', `sms:${tel}`, w().text); }
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(page.email || '')) add('email', `mailto:${encodeURIComponent(page.email)}`, w().emailBtn);
  c.hidden = !c.children.length;
}

// ── The lead ─────────────────────────────────────────────────────────────────────────────────────────────────
$('lSend').onclick = async () => {
  if (!result || !lot) return;
  const t = w();
  const name = $<HTMLInputElement>('lName').value.trim();
  const phone = $<HTMLInputElement>('lPhone').value.trim();
  const email = $<HTMLInputElement>('lEmail').value.trim();
  const err = $('lErr');
  if (!name) { err.textContent = t.needName; $<HTMLInputElement>('lName').focus(); return; }
  if (phone.replace(/\D/g, '').length < 7 && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err.textContent = t.needContact; return; }
  err.textContent = '';
  const btn = $<HTMLButtonElement>('lSend'); btn.disabled = true; $('lSendText').textContent = t.sending;
  try {
    const ok = await rpc<boolean>('submit_adu_lead', {
      p_code: code, p_name: name, p_phone: phone, p_email: email, p_address: lot.address || $<HTMLInputElement>('addr').value.trim(),
      p_pin: lot.pin, p_city: lot.city, p_zoning: lot.zoning, p_lot: lot.lotSqft || null, p_verdict: result.verdict,
      p_size: result.maxSf || null, p_message: $<HTMLTextAreaElement>('lMsg').value.trim(), p_lang: lang,
    });
    if (!ok) throw new Error('closed');
    sent = true; unlocked = true; show();
    $('report').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch {
    err.textContent = t.sendFail;
  } finally { btn.disabled = false; $('lSendText').textContent = t.send; }
};

$('print').onclick = () => window.print();
$('again').onclick = () => {
  result = null; lot = null;
  $('result').hidden = true; $('searchCard').hidden = false;
  const a = $<HTMLInputElement>('addr'); a.value = ''; a.focus();
};

// ── Start ────────────────────────────────────────────────────────────────────────────────────────────────────
(async () => {
  words();
  if (code && cfg.url) {
    try {
      const rows = await rpc<Page[]>('get_adu_page', { p_code: code });
      page = rows?.[0] ?? null;
      if (page) {
        if (!/^vi/i.test(navigator.language) && (page.lang === 'vi' || page.lang === 'en')) lang = page.lang as AduLang;
        brand(); words();
      }
    } catch { /* the check still works without the contractor's details */ }
  }
  const a = new URLSearchParams(location.search).get('a');
  if (a) { $<HTMLInputElement>('addr').value = a; $('searchForm').dispatchEvent(new Event('submit', { cancelable: true })); }
})();
