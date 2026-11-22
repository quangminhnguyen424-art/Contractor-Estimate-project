import { isJobTypeId, JOB_TYPES, jobType } from './jobTypes';
import type { Answers, AnswerValue, FinishLevel, JobTypeId } from './types';
import { cleanPlan, planSystem, planUserText, type PlanRequest, type PlanResult } from './workPlan';

/**
 * The AI layer.
 * - demoAI: offline rules, runs on the phone, free.
 * - directClaudeAI: calls Claude straight from the device with the contractor's OWN API key
 *   (personal use only — the key is stored on that device and never shipped inside the app).
 * - claudeAI: calls our backend (server/), which holds a shared key — for when the app has other users.
 */
export interface ImageInput {
  mediaType: 'image/jpeg' | 'image/png';
  base64: string;
  /** Which of the contractor's photos this is ("Photo 3"), so Claude's findings point at the right picture. */
  label?: string;
}

export interface ScopeResult {
  jobTypeId?: JobTypeId;
  answers: Answers;
  heard: string[]; // human-readable list of what was picked up
  notes?: string[]; // things Claude noticed (conditions, risks, questions to ask); photo findings start with "Photo N:"
  /** Where each filled-in answer came from, so the contractor can confirm anything taken from a photo. */
  sources?: Record<string, 'notes' | 'photo' | 'assumed'>;
  source?: 'claude' | 'demo';
  error?: string; // set when Claude was asked but failed and the demo result was used instead
}

export interface PastJobResult {
  jobTypeId?: JobTypeId;
  sizeSf?: number;
  price?: number;
  finish?: FinishLevel;
  title?: string;
  error?: string;
}

/** What Claude knows about this contractor, so answers fit how they work. */
export interface AiContext {
  about?: string; // the contractor's own words: how they work, what they include, their goals
  work?: string; // their setup interview answers, as sentences
  history?: string; // e.g. "8 past jobs of this type, average $310/SF"
  scope?: string; // limits on the job, e.g. "interior only" after a 3D room scan
  prices?: string; // what this contractor really paid on recent receipts
  learned?: string; // what Studwise learned from the quotes they sent (engine/learned.ts)
  language?: string; // the contractor's language, in English ("Vietnamese"): notes for them are written in it
}

/** One turn of the assistant chat. */
export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface EstimatorAI {
  name: string;
  /** Free conversation with the assistant. Rejects with a message the contractor can act on. */
  chat(turns: ChatTurn[], system: string): Promise<string>;
  /** One-off writing task (step lists, translations, logs, posts). Rejects with a message the contractor can act on. */
  complete(prompt: string, images?: ImageInput[], maxTokens?: number): Promise<string>;
  parseScope(text: string, jobTypeId?: JobTypeId, images?: ImageInput[], ctx?: AiContext): Promise<ScopeResult>;
  /**
   * Plans one job: its own sections and items, from the notes, photos and size. Rejects when the AI is off, could not
   * answer, or needs a measurement (NeedSizeError): there is no offline stand-in, a job is never priced from a template.
   */
  planJob(req: PlanRequest, images?: ImageInput[], ctx?: AiContext): Promise<PlanResult>;
  extractPastJob(text: string): Promise<PastJobResult>;
}

const WORD_NUMS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  twelve: 12, fifteen: 15, twenty: 20,
};
// \b on both sides so "a" inside "pella" or "area" is never read as a number.
const NUM = '\\b(\\d+(?:\\.\\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty)\\b';
const toNum = (s: string) => (WORD_NUMS[s.toLowerCase()] ?? parseFloat(s));
const AREA = '(?:sf|sq\\.?\\s*f(?:ee)?t|sqft|square\\s*f(?:ee|oo)t)';
const LEN = '(?:lf|linear\\s*f(?:ee|oo)t|ft|feet|foot)';

function grab(text: string, pattern: string): number | undefined {
  const m = new RegExp(pattern, 'i').exec(text);
  return m ? toNum(m[1]) : undefined;
}

/** "1,200" -> "1200" so thousands separators don't split numbers. */
const normalize = (text: string) => ` ${text.replace(/(\d),(?=\d{3}\b)/g, '$1')} `;

export function guessJobType(text: string): JobTypeId | undefined {
  const t = text.toLowerCase();
  // The contractor's own types of work, by whole name. Multi-word names ("pressure washing") win over the
  // built-in guesses; a one-word name ("tile") only counts when nothing built-in matches.
  const escape = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const ownMatches = JOB_TYPES.filter((j) => j.custom && j.name.trim().length > 2
    && new RegExp(`(?:^|[^a-z0-9])${escape(j.name.trim().toLowerCase())}(?:$|[^a-z0-9])`).test(t))
    .sort((a, b) => b.name.length - a.name.length);
  const ownLong = ownMatches.find((j) => /\s/.test(j.name.trim()));
  if (ownLong) return ownLong.id;
  const builtIn = guessBuiltIn(t);
  return builtIn ?? ownMatches[0]?.id;
}

function guessBuiltIn(t: string): JobTypeId | undefined {
  if (/basement|adu conversion|garage conversion|convert (?:the |a |my )?(?:garage|basement|attic)|\d+ rooms? (?:to|into) \d+ bed/.test(t)) return 'basement';
  if (/dadu|new adu|detached adu|backyard cottage/.test(t)) return 'adu';
  if (/new (?:home|house|build|construction)/.test(t)) return 'newbuild';
  if (/whole[- ]?(?:house|home)\s*remodel/.test(t)) return 'wholehouse';
  if (/kitchen/.test(t) && !/bath/.test(t)) return 'kitchen';
  if (/bath|shower|\btub\b|vanity|toilet/.test(t)) return 'bathroom';
  if (/exterior\s*paint|paint\s*(?:the\s*)?(?:outside|exterior)/.test(t)) return 'extpaint';
  if (/paint/.test(t)) return 'painting';
  // Other trades, checked after the remodel types so "bathroom with a new window" stays a bathroom.
  if (/re-?roof|roof(?:ing)?\b|shingles?/.test(t)) return 'roofing';
  if (/siding|hardie/.test(t)) return 'siding';
  if (/\bdeck\b/.test(t)) return 'deck';
  if (/\bfenc(?:e|ing)\b/.test(t)) return 'fence';
  if (/gutters?/.test(t)) return 'gutters';
  if (/retaining\s*wall/.test(t)) return 'retaining';
  if (/concrete|driveway|patio\s*slab|sidewalk/.test(t)) return 'concrete';
  if (/landscap|hardscape|pavers?/.test(t)) return 'landscape';
  if (/heat\s*pump|hvac|furnace|mini-?split|\bac\b/.test(t)) return 'hvac';
  if (/water\s*heater|tankless/.test(t)) return 'waterheater';
  if (/panel\s*(?:upgrade|replace|change)|service\s*upgrade|200\s*a(?:mp)?/.test(t)) return 'panel';
  if (/rewir/.test(t)) return 'rewire';
  if (/re-?pipe/.test(t)) return 'repipe';
  if (/\baddition\b/.test(t)) return 'addition';
  if (/tenant\s*improvement|commercial|\bti\b/.test(t)) return 'commercial';
  if (/windows?/.test(t) && !/egress/.test(t)) return 'windows';
  if (/insulat/.test(t)) return 'insulation';
  if (/drywall|sheetrock/.test(t) && !/bath|kitchen|basement/.test(t)) return 'drywall';
  if (/counter-?tops?/.test(t) && !/kitchen\s*remodel/.test(t)) return 'countertops';
  if (/floor|lvp|laminate|hardwood/.test(t)) return 'flooring';
  return undefined;
}

/** Why the AI did not answer when it is simply not on, in words that say what to do about it. */
export const AI_OFF = {
  sharing: 'AI sharing is off. Turn it on under Me > Studwise AI. Estimates, quotes, signing and payments work without it.',
  connect: 'Studwise AI is not connected. Log in to your Studwise account under Me to use it.',
};
/** The AI is off (not a failure): callers can fall back quietly or show the message. */
export class AiOffError extends Error {}

/** The offline reader, for a user who has not turned AI sharing on: its messages point at the switch. */
export const sharingOffAI = (): EstimatorAI => ({
  ...demoAI,
  async complete() { throw new AiOffError(AI_OFF.sharing); },
  async chat() { throw new AiOffError(AI_OFF.sharing); },
  async planJob() { throw new AiOffError(AI_OFF.sharing); },
});

/** Rule-based stand-in for Claude: pulls quantities out of a spoken or typed job description. */
export const demoAI: EstimatorAI = {
  name: 'Demo AI (offline)',
  async complete() {
    throw new AiOffError(AI_OFF.connect);
  },
  async planJob() {
    throw new AiOffError(AI_OFF.connect);
  },
  async chat() {
    throw new AiOffError(AI_OFF.connect);
  },
  async parseScope(text, jobTypeId) {
    const jt = jobTypeId ?? guessJobType(text);
    const answers: Answers = {};
    const heard: string[] = [];
    const set = (id: string, v: number | string | boolean, label: string) => {
      if (jt && !jobType(jt).questions.some((q) => q.id === id)) return;
      if (id in answers) return; // first (most specific) match wins
      answers[id] = v;
      heard.push(label);
    };
    let t = normalize(text);

    // Walls being removed first, then cut them out so they aren't read as new walls.
    const demoRe = new RegExp(`(?:remove|demo(?:lish)?|tear\\s*out|take\\s*out|open\\s*up)[^.\\d]{0,15}${NUM}\\s*${LEN}\\s*(?:of\\s*)?(?:the\\s*)?walls?`, 'i');
    const demoM = demoRe.exec(t);
    if (demoM) {
      set('demoWallLf', toNum(demoM[1]), `${toNum(demoM[1])} LF wall removed`);
      t = t.replace(demoM[0], ' ');
    }
    const wall = grab(t, `${NUM}\\s*${LEN}\\s*(?:of\\s*)?(?:new\\s*)?walls?`) ?? grab(t, `walls?[^.\\d]{0,20}${NUM}\\s*(?:lf|ft|feet)`);
    if (wall) set('newWallLf', wall, `${wall} LF new wall`);

    // Specific areas first: shower walls, backsplash, floor tile, tile.
    const showerWall = grab(t, `${NUM}\\s*${AREA}\\s*(?:of\\s*)?(?:tile\\s*)?(?:on\\s*)?(?:the\\s*)?shower\\s*walls?`)
      ?? grab(t, `shower\\s*walls?[^.\\d]{0,15}${NUM}\\s*${AREA}`);
    if (showerWall) set('showerWallSf', showerWall, `${showerWall} SF shower walls`);
    const backsplash = grab(t, `${NUM}\\s*${AREA}\\s*(?:of\\s*)?(?:tile\\s*)?backsplash`) ?? grab(t, `backsplash[^.\\d]{0,15}${NUM}\\s*${AREA}`);
    if (backsplash) set('backsplashSf', backsplash, `${backsplash} SF backsplash`);
    const floorTile = grab(t, `${NUM}\\s*${AREA}\\s*(?:of\\s*)?(?:tile\\s*)?floor`);
    if (floorTile) { set('floorTileSf', floorTile, `${floorTile} SF floor tile`); set('tileSf', floorTile, `${floorTile} SF tile`); }
    const tile = grab(t, `${NUM}\\s*${AREA}\\s*(?:of\\s*)?tile`) ?? grab(t, `tiles?[^.\\d]{0,30}${NUM}\\s*${AREA}`);
    if (tile) { set('tileSf', tile, `${tile} SF tile`); set('floorTileSf', tile, `${tile} SF floor tile`); }
    // Project size: an area that isn't one of the above.
    const size = grab(t, `${NUM}\\s*${AREA}(?!\\s*(?:of\\s*)?(?:new\\s*)?(?:tile|floor|shower|backsplash|counter|wall))`);
    if (size && size !== showerWall && size !== backsplash && size !== floorTile && size !== tile) set('sizeSf', size, `${size} SF`);

    const showers = grab(t, `${NUM}\\s*(?:new\\s*)?(?:\\d+\\s*x\\s*\\d+\\s*)?(?:tiled?\\s*|walk-?in\\s*)?showers?`);
    if (showers) set('showers', showers, `${showers} shower${showers > 1 ? 's' : ''}`);
    else if (/shower/i.test(t)) set('showers', 1, '1 shower');

    const toilets = grab(t, `${NUM}\\s*(?:new\\s*)?toilets?`);
    if (toilets) set('toilets', toilets, `${toilets} toilet${toilets > 1 ? 's' : ''}`);
    const vanities = grab(t, `${NUM}\\s*(?:new\\s*)?vanit(?:y|ies)`);
    if (vanities) set('vanities', vanities, `${vanities} vanit${vanities > 1 ? 'ies' : 'y'}`);

    const bedrooms = grab(t, `(?:into|to)\\s*${NUM}\\s*bed(?:room)?s?`) ?? grab(t, `${NUM}\\s*bed(?:room)?s?`);
    if (bedrooms) set('bedrooms', bedrooms, `${bedrooms} bedrooms when done`);
    const fromRooms = grab(t, `${NUM}\\s*rooms?\\s*(?:to|into)`);
    if (bedrooms && fromRooms && bedrooms > fromRooms) set('newBedrooms', bedrooms - fromRooms, `${bedrooms - fromRooms} new bedroom`);

    const doors = grab(t, `${NUM}\\s*(?:new\\s*)?(?:interior\\s*)?(?:\\d+"?\\s*)?doors?`);
    if (doors) set('doors', doors, `${doors} doors`);
    if (/bi-?fold/i.test(t)) set('bifolds', grab(t, `${NUM}\\s*bi-?folds?`) ?? 1, 'bifold door');
    const lights = grab(t, `${NUM}\\s*(?:new\\s*)?(?:recessed\\s*|can\\s*|led\\s*)?lights?`);
    if (lights) set('lights', lights, `${lights} lights`);
    const switches = grab(t, `${NUM}\\s*(?:new\\s*)?switch(?:es)?`);
    if (switches) set('switches', switches, `${switches} switches`);
    const outlets = grab(t, `${NUM}\\s*(?:new\\s*)?(?:outlets?|receptacles?|plugs?)`);
    if (outlets) set('outlets', outlets, `${outlets} outlets`);
    const cab = grab(t, `${NUM}\\s*${LEN}\\s*(?:of\\s*)?cabinets?`);
    if (cab) set('cabinetLf', cab, `${cab} LF cabinets`);
    const counter = grab(t, `${NUM}\\s*${AREA}\\s*(?:of\\s*)?(?:quartz\\s*|granite\\s*)?counter(?:top)?s?`);
    if (counter) set('countertopSf', counter, `${counter} SF countertop`);
    const drain = grab(t, `(?:main\\s*drain|drain|sewer(?:\\s*line)?)[^.\\d]{0,25}${NUM}\\s*(?:ft|feet)`);
    if (drain) set('drainDistanceFt', drain, `${drain} ft to main drain`);
    const panel = grab(t, `panel[^.\\d]{0,25}${NUM}\\s*(?:ft|feet)`) ?? grab(t, `${NUM}\\s*(?:ft|feet)\\s*(?:from|to)\\s*(?:the\\s*)?(?:electrical\\s*)?panel`);
    if (panel) set('panelDistanceFt', panel, `${panel} ft from panel`);

    if (/basement/i.test(t)) set('foundation', 'basement', 'basement slab');
    else if (/\bslab\b/i.test(t)) set('foundation', 'slab', 'slab foundation');
    else if (/crawl/i.test(t)) set('foundation', 'crawl', 'crawlspace');
    if (/dishwasher/i.test(t)) set('dishwasher', true, 'dishwasher');
    if (/\b(?:washer|laundry)\b/i.test(t)) set('washer', true, 'washer hookup');
    if (/\bdryer\b/i.test(t)) set('dryer30a', true, '30A dryer circuit');
    if (/gas\s*(?:range|stove|cooktop)/i.test(t)) set('range', 'gas', 'gas range');
    else if (/\b(?:range|stove|cooktop)\b/i.test(t)) { set('range50a', true, '50A range circuit'); set('range', 'electric', 'electric range'); }
    if (/ice\s*maker|fridge|refrigerator/i.test(t)) set('iceMaker', true, 'ice maker line');
    if (/kitchen/i.test(t) && jt === 'basement') set('kitchenSink', true, 'kitchen sink');
    if (/walk-?in|tiled?\s*shower|tile\s*shower/i.test(t)) set('showerType', 'tile', 'tiled shower');
    else if (/stall/i.test(t)) set('showerType', 'stall', 'shower stall');
    else if (/\btub\b/i.test(t) && !/(?:remove|replace|convert|rip\s*out)[^.]{0,15}\btub\b|\btub\s*(?:to|into)\b/i.test(t)) set('showerType', 'tub', 'tub');
    if (/\b(?:lvp|vinyl\s*plank|vinyl)\b/i.test(t)) set('floorType', 'lvp', 'LVP flooring');
    const supplies = /(?:owner|client|customer|homeowner)s?\s*(?:will\s*)?(?:supplies|supplied|supply|buys|buying|provides|providing)\s*([^.;]{0,40})/i.exec(t);
    if (supplies) {
      const what = supplies[1].toLowerCase();
      if (/cabinet/.test(what)) set('cabinetsBy', 'owner', 'owner supplies cabinets');
      if (/fixture|toilet|vanit|shower|sink|faucet|tub/.test(what) || !/cabinet/.test(what)) set('fixturesBy', 'owner', 'owner supplies fixtures');
    }
    // Main quantity for types priced per linear foot or per item.
    const unit = jt ? jobType(jt).unit : undefined;
    if (unit === 'LF') {
      const len = grab(t, `${NUM}\\s*${LEN}`);
      if (len) set('sizeSf', len, `${len} LF`);
    } else if (unit === 'EA') {
      const count = grab(t, `${NUM}\\s*(?:new\\s*)?(?:[a-z-]+\\s*)?(?:windows?|doors?|water\\s*heaters?|heat\\s*pumps?|systems?|units?|items?)`);
      if (count) set('sizeSf', count, `${count} items`);
    }

    const year = grab(t, `(?:built|year)[^.\\d]{0,12}((?:18|19|20)\\d\\d)`);
    if (year) set('yearBuilt', year, `built ${year}`);

    return { jobTypeId: jt, answers, heard, source: 'demo' };
  },

  async extractPastJob(text) {
    const t = normalize(text);
    // Prices: prefer a pre-tax contract price / subtotal, then a total that isn't a tax line.
    const lines = t.split('\n');
    const amountsOn = (line: string) => [...line.matchAll(/\$\s*(\d+(?:\.\d+)?)/g)].map((m) => parseFloat(m[1]));
    const isTaxLine = (l: string) => /tax/i.test(l) && !/before\s*tax|pre-?tax|excl/i.test(l);
    const pick = (re: RegExp) => {
      for (const l of lines) if (re.test(l) && !isTaxLine(l) && amountsOn(l).length) return amountsOn(l)[0];
      return undefined;
    };
    const anyAmounts = lines.filter((l) => !isTaxLine(l)).flatMap(amountsOn);
    const price = pick(/sub-?total|contract|price|before\s*tax|pre-?tax/i) ?? pick(/\btotal\b/i) ?? (anyAmounts.length ? Math.max(...anyAmounts) : undefined);
    const size = grab(t, `${NUM}\\s*${AREA}`);
    const finish: FinishLevel | undefined = /high[- ]?end|luxury|premium|\bcustom\b/i.test(t) ? 'high'
      : /\bbasic\b|builder[- ]grade|economy|budget/i.test(t) ? 'basic' : /\bmid\b|mid[- ]?grade|mid[- ]?range/i.test(t) ? 'mid' : undefined;
    const firstLine = text.split('\n').map((x) => x.trim()).find((x) => x.length > 3);
    return { jobTypeId: guessJobType(text), sizeSf: size, price, finish, title: firstLine?.slice(0, 60) };
  },
};

/** Calls our backend (see /server). Used when EXPO_PUBLIC_AI_URL is set. */
export function claudeAI(baseUrl: string): EstimatorAI {
  const post = async <T>(path: string, body: unknown): Promise<T> => {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`AI request failed (${res.status})`);
    return (await res.json()) as T;
  };
  return {
    name: 'Studwise (server)',
    async chat(turns, system) {
      return post<{ text: string }>('/chat', { turns, system }).then((r) => r.text).catch(() => demoAI.chat(turns, system));
    },
    async complete(prompt, images, maxTokens = 1500) {
      const imgs = (images ?? []).slice(0, 8).map((img, i) => ({ label: img.label ?? `Photo ${i + 1}`, mediaType: img.mediaType, base64: img.base64 }));
      return post<{ text: string }>('/complete', { prompt, images: imgs, maxTokens })
        .then((r) => r.text)
        .catch(() => { throw new Error('Could not reach the AI server. Try again.'); });
    },
    async planJob() {
      throw new AiOffError(AI_OFF.connect);
    },
    async parseScope(text, jobTypeId) {
      try {
        const raw = await post<ScopeResult>('/parse-scope', { text, jobTypeId, questions: jobTypeId ? jobType(jobTypeId).questions : undefined });
        return cleanScopeResult(raw, jobTypeId);
      } catch {
        return demoAI.parseScope(text, jobTypeId); // fall back so the contractor is never stuck
      }
    },
    async extractPastJob(text) {
      try {
        return cleanPastJob(await post<PastJobResult>('/extract-past-job', { text }));
      } catch {
        return demoAI.extractPastJob(text);
      }
    },
  };
}

// ---------- Claude called directly from the device (personal use) ----------

export const CLAUDE_MODEL = 'claude-sonnet-5-5';

/** Upper limits that stop an impossible AI answer (e.g. 50,000 lights) from reaching the price. */
function maxFor(id: string, unit?: string, priced = false): number {
  if (id === 'yearBuilt') return 2100;
  const u = (unit ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (['sf', 'sqft', 'sqfeet', 'squarefeet', 'squarefoot'].includes(u)) return 20000;
  if (['lf', 'linearfeet', 'linearfoot'].includes(u)) return 2000;
  if (['ft', 'feet', 'foot'].includes(u)) return 500;
  if (priced) return 50; // the contractor's own priced counts (dump runs, hours…): keep a wrong reading from adding thousands
  return 200; // counts: doors, lights, outlets, fixtures…
}

/** Keep only answers that match a real question and a valid value for it. Never trust model output blindly. */
export function cleanAnswers(jobTypeId: JobTypeId, raw: unknown): Answers {
  const out: Answers = {};
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  for (const q of jobType(jobTypeId).questions) {
    if (!(q.id in r)) continue;
    const v = r[q.id];
    let clean: AnswerValue | undefined;
    if (q.kind === 'number') {
      const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v.replace(/,/g, '')) : NaN;
      if (Number.isFinite(n) && n >= 0 && n <= maxFor(q.id, q.unit, !!(q.custom && q.price))) clean = n;
    } else if (q.kind === 'yesno') {
      if (typeof v === 'boolean') clean = v;
      else if (v === 'yes' || v === 'true') clean = true;
      else if (v === 'no' || v === 'false') clean = false;
    } else if (q.kind === 'choice') {
      if (typeof v === 'string' && q.options?.some((o) => o.value === v)) clean = v;
    } else if (q.kind === 'text') {
      if (typeof v === 'string' && v.trim()) clean = v.trim().slice(0, 300);
    }
    if (clean !== undefined) out[q.id] = clean;
  }
  return out;
}

const isJobType = isJobTypeId;
const strList = (v: unknown, max: number) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim().slice(0, 240)).slice(0, max) : [];

export function cleanScopeResult(raw: unknown, jobTypeId?: JobTypeId): ScopeResult {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const jt = jobTypeId ?? (isJobType(r.jobTypeId) ? r.jobTypeId : undefined);
  const answers = jt ? cleanAnswers(jt, r.answers) : {};
  // Answers that add money to the quote are called out so the contractor checks them.
  const priced = jt
    ? jobType(jt).questions.filter((q) => q.custom && q.price && q.id in answers && answers[q.id] !== false && answers[q.id] !== 0)
      .map((q) => `Check: ${q.label}${q.kind === 'number' ? ` = ${answers[q.id]}` : ''} (adds to the price)`)
    : [];
  const rawSources = (r.sources && typeof r.sources === 'object' ? r.sources : {}) as Record<string, unknown>;
  const sources = Object.fromEntries(Object.keys(answers).map((k) => [k, rawSources[k] === 'photo' ? 'photo' : rawSources[k] === 'assumed' ? 'assumed' : 'notes'])) as Record<string, 'notes' | 'photo' | 'assumed'>;
  return {
    jobTypeId: jt,
    answers,
    sources,
    heard: [...priced, ...strList(r.heard, 30)],
    notes: strList(r.notes, 10),
    source: 'claude',
  };
}

export function cleanPastJob(raw: unknown): PastJobResult {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pos = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined);
  const finish = r.finish === 'basic' || r.finish === 'mid' || r.finish === 'high' ? r.finish : undefined;
  return {
    jobTypeId: isJobType(r.jobTypeId) ? r.jobTypeId : undefined,
    sizeSf: pos(r.sizeSf), price: pos(r.price), finish,
    title: typeof r.title === 'string' ? r.title.slice(0, 60) : undefined,
  };
}

/** Pull the first JSON object out of a model reply (it may wrap it in text or ```json fences). */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No JSON in reply');
  return JSON.parse(text.slice(start, end + 1));
}

const SCOPE_SYSTEM = `You are an experienced Washington State general contractor helping another contractor fill in an estimate.
You get the contractor's notes about a job (typed or dictated, may be informal, in any language or mixed with English) and sometimes site photos.
Work this job out on its own, the way you would if you walked it yourself. Do not fall back on a standard package: two bathrooms are never the same job.
Give an answer for EVERY listed question, in this order of trust:
1. What the contractor's notes say. Their numbers always win.
2. What is clearly visible in the photos (which fixtures exist, what is damaged, what finish is there now, how many of something).
3. Otherwise your own judgment of what THIS job needs, given everything in the notes and photos. If a piece of work is not part of this job, answer 0, false or the "none" option, so it is left out of the price. Include only work this job really calls for.
The one exception is the job's main size ("sizeSf") and other measured sizes: never invent a measurement. If no size is given and none can be worked out from a stated dimension or a known-size reference, leave that question out and say in "notes" which size is still needed.
- Numbers are plain numbers in the question's unit (no text). Yes/no answers are true or false. Choice answers must be one of the listed option values. Text answers are short phrases.
- "sizeSf" is always the job's main quantity in its price unit (SF, LF or number of items).
- Questions marked custom were written by this contractor for their own way of working: answer them whenever the notes or photos support it.
- When the contractor describes how they work, use it: for example what they always include, sub out, or flag.
- "heard": short English phrases of what you picked up, e.g. "45 LF new wall", "2 showers".
- "notes": up to 8 short, concrete observations a GC would flag from the notes or photos: visible damage (water stains, rot, mold), code issues (no GFCI near water, missing egress, ungrounded outlets, double-tapped breakers), access problems, items to confirm with the owner, likely hidden conditions. Do not repeat the answers. Empty list if nothing.
- "sources": for every answer, "notes" if the contractor's notes say it, "photo" if you took it from a photo, or "assumed" if it is your own judgment (rule 3). The contractor is shown which is which, so be exact.
Photos — accuracy matters more than finding something:
- Photos are labeled (Photo 1, Photo 2 …). Start every finding from a photo with its label, e.g. "Photo 2: water stain on the ceiling below the tub".
- Report only what is clearly visible. If you are not sure, say "Possible …, check on site" — never state a guess as fact. Do not describe things that are out of frame or hidden.
- Do not read measurements or areas from a photo unless a known-size reference is visible (a standard 80" door, a 4x8 drywall sheet, a 12" tile, a tape measure); then say which reference you used. Counts of clearly visible items (outlets, windows, fixtures) are fine.
- If a photo disagrees with the notes, keep the contractor's number and add a note about the difference.
Reply with ONLY a JSON object: {"jobTypeId": string, "answers": {questionId: value}, "sources": {questionId: "notes"|"photo"|"assumed"}, "heard": [string], "notes": [string]}`;

/** Built when used, so it lists the contractor's own job types too. */
const pastJobSystem = () => `Extract a completed construction job from pasted quote or invoice text.
Use the pre-tax contract price, not a total that includes sales tax.
Job types (id = name, price unit): ${JOB_TYPES.filter((j) => j.id !== 'small').map((j) => `${j.id} = ${j.name} (${j.unit})`).join('; ')}.
sizeSf is the job's main quantity in that type's unit (square feet, linear feet, or number of items; 1 for JOB) if stated.
Reply with ONLY a JSON object: {"jobTypeId": one of the ids above or null, "sizeSf": number or null, "price": number or null, "finish": "basic"|"mid"|"high" or null, "title": short job name}`;

/** "Attached in order: Photo 1, Photo 3." — photos that couldn't be read are skipped, so labels keep their numbers. */
function photoLine(imgs: ImageInput[]): string {
  if (!imgs.length) return '';
  return `${imgs.length} site photo(s) attached, in this order: ${imgs.map((m, i) => m.label ?? `Photo ${i + 1}`).join(', ')}.\n\n`;
}

/** The contractor context added to Claude's instructions. */
function contextText(ctx?: AiContext): string {
  const parts: string[] = [];
  if (ctx?.work?.trim()) parts.push(`How this contractor usually works (from their setup answers): ${ctx.work.trim()}`);
  if (ctx?.about?.trim()) parts.push(`About this contractor, in their own words:\n${ctx.about.trim().slice(0, 2000)}`);
  if (ctx?.history?.trim()) parts.push(`Their pricing history for this job type: ${ctx.history.trim()}`);
  if (ctx?.scope?.trim()) parts.push(ctx.scope.trim());
  if (ctx?.prices?.trim()) parts.push(ctx.prices.trim().slice(0, 2000));
  if (ctx?.learned?.trim()) parts.push(`Learned from the quotes this contractor sent:\n${ctx.learned.trim().slice(0, 2500)}`);
  if (ctx?.language?.trim()) parts.push(`Write "heard" and "notes" in ${ctx.language.trim()}, the contractor's language (keep the "Photo 2:" labels). JSON keys, option values, numbers and units stay exactly as specified.`);
  return parts.length ? `\n\n${parts.join('\n\n')}` : '';
}

function questionsFor(jobTypeId?: JobTypeId) {
  const types = jobTypeId ? [jobType(jobTypeId)] : JOB_TYPES.filter((j) => j.id !== 'small');
  return types.map((jt) => ({
    jobTypeId: jt.id,
    name: jt.name,
    priceUnit: jt.unit,
    questions: jt.questions.map((q) => ({
      id: q.id, label: q.label, kind: q.kind, unit: q.unit,
      options: q.options?.map((o) => o.value),
      ...(q.custom ? { custom: true } : {}),
    })),
  }));
}

const CLAUDE_TIMEOUT_MS = 60_000;
/** Planning a whole job with photos is the longest answer the app asks for. */
const PLAN_TIMEOUT_MS = 95_000;

/** The plan from the AI's reply, with the answers to the contractor's own questions checked against those questions. */
function planFromReply(reply: string, req: PlanRequest): PlanResult {
  const plan = cleanPlan(parseReply(reply));
  if (plan.work.length === 0) throw new Error('Studwise did not find any work to price in this job. Say more about what is being done, then try again.');
  const own = new Set(jobType(req.jobTypeId).questions.filter((q) => q.custom).map((q) => q.id));
  const answers = Object.fromEntries(Object.entries(cleanAnswers(req.jobTypeId, plan.answers)).filter(([k]) => own.has(k)));
  return { ...plan, answers };
}

function planContextText(ctx?: AiContext): string {
  // The plan has no "heard" list: only the notes are written in the contractor's language.
  return contextText(ctx).replace('Write "heard" and "notes" in', 'Write "notes" in');
}

/**
 * How to reach Claude: the contractor's own API key, or (signed in to Studwise cloud) the Studwise server, which
 * holds the key and checks the daily limit.
 */
export type ClaudeAuth = string | { proxyUrl: string; anonKey: string; getToken: () => Promise<string | null> };

async function callClaude(apiKey: ClaudeAuth, system: string, content: unknown[], maxTokens: number, timeoutMs = CLAUDE_TIMEOUT_MS): Promise<string> {
  return callClaudeTurns(apiKey, system, [{ role: 'user', content }], maxTokens, false, timeoutMs);
}

async function callClaudeTurns(
  apiKey: ClaudeAuth, system: string, messages: { role: 'user' | 'assistant'; content: unknown }[], maxTokens: number, keepPartial = false,
  timeoutMs = CLAUDE_TIMEOUT_MS,
): Promise<string> {
  let res: Response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const viaCloud = typeof apiKey !== 'string';
  try {
    if (viaCloud) {
      const token = await apiKey.getToken();
      if (!token) { clearTimeout(timer); throw Object.assign(new Error('Sign in to Studwise cloud to use the AI.'), { signedOut: true }); }
      res = await fetch(apiKey.proxyUrl, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}`, apikey: apiKey.anonKey },
        body: JSON.stringify({ max_tokens: maxTokens, system, messages }),
      });
    } else {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          // Required for calls made from a browser; harmless in the phone app.
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: maxTokens, system, messages }),
      });
    }
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof Error && 'signedOut' in e) throw e;
    if (controller.signal.aborted) throw new Error('Studwise took too long to answer (weak signal?). Try again with fewer photos.');
    throw new Error('Could not reach Studwise. Check your internet connection.');
  }
  clearTimeout(timer);
  if (!res.ok) {
    let detail = '';
    try {
      const err = (await res.json()) as { error?: { message?: string } | string };
      detail = typeof err.error === 'string' ? err.error : err.error?.message ?? '';
    } catch { /* ignore */ }
    if (viaCloud && (res.status === 401 || res.status === 402 || res.status === 429 || res.status === 413 || res.status === 503)) throw new Error(detail || 'Studwise AI is not available right now.');
    if (res.status === 401) throw new Error('Claude API key is not valid. Check it under Me → Studwise AI.');
    if (res.status === 429) throw new Error('Studwise is busy or your rate limit was reached. Try again in a minute.');
    if (/credit|billing|balance/i.test(detail)) throw new Error('Your Anthropic account is out of credit. Add credit in the Anthropic Console.');
    throw new Error(`Studwise error (${res.status})${detail ? `: ${detail}` : ''}`);
  }
  const data = (await res.json()) as { content?: { type: string; text?: string }[]; stop_reason?: string };
  const text = (data.content ?? []).map((c) => c.text ?? '').join('');
  if (data.stop_reason === 'max_tokens') {
    // A chat answer that ran long is still worth reading; a cut-off JSON answer cannot be used.
    if (keepPartial && text.trim()) return `${text.trim()} …`;
    throw new Error("Studwise's answer was cut off. Try a shorter description or fewer photos.");
  }
  if (data.stop_reason === 'refusal' && !text.trim()) throw new Error('Studwise could not help with that request.');
  return text;
}

/** Parse Claude's JSON reply, turning parser errors into a message a contractor can act on. */
function parseReply(reply: string): unknown {
  try {
    return extractJson(reply);
  } catch {
    throw new Error("Studwise's answer couldn't be read. Try again, or fill in the questions yourself.");
  }
}

export function directClaudeAI(apiKey: ClaudeAuth): EstimatorAI {
  return {
    name: `Studwise (${CLAUDE_MODEL})`,
    async chat(turns, system) {
      return callClaudeTurns(apiKey, system, turns.map((t) => ({ role: t.role, content: t.content })), 2000, true);
    },
    async complete(prompt, images, maxTokens = 1500) {
      const content: unknown[] = (images ?? []).slice(0, 8).flatMap((img, i) => [
        { type: 'text', text: `${img.label ?? `Photo ${i + 1}`}:` },
        { type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.base64 } },
      ]);
      content.push({ type: 'text', text: prompt });
      return callClaude(apiKey, 'You help a construction contractor. Follow the reply format exactly.', content, maxTokens);
    },
    async planJob(req, images, ctx) {
      const imgs = (images ?? []).slice(0, 8);
      const content: unknown[] = imgs.flatMap((img, i) => [
        { type: 'text', text: `${img.label ?? `Photo ${i + 1}`}:` },
        { type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.base64 } },
      ]);
      content.push({ type: 'text', text: planUserText(req, photoLine(imgs)) });
      const reply = await callClaude(apiKey, planSystem(req.wantVi) + planContextText(ctx), content, 4000, PLAN_TIMEOUT_MS);
      return planFromReply(reply, req);
    },
    async parseScope(text, jobTypeId, images, ctx) {
      const jt = jobTypeId ?? guessJobType(text);
      const imgs = (images ?? []).slice(0, 8);
      // Each photo is preceded by its label so findings can name the right picture.
      const content: unknown[] = imgs.flatMap((img, i) => [
        { type: 'text', text: `${img.label ?? `Photo ${i + 1}`}:` },
        { type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.base64 } },
      ]);
      content.push({
        type: 'text',
        text: `Job type: ${jt ?? 'unknown — pick the best jobTypeId'}\nQuestions:\n${JSON.stringify(questionsFor(jt))}\n\n${photoLine(imgs)}Contractor notes:\n${text || '(no notes, use the photos)'}`,
      });
      try {
        const reply = await callClaude(apiKey, SCOPE_SYSTEM + contextText(ctx), content, 1500);
        return cleanScopeResult(parseReply(reply), jt);
      } catch (e) {
        const fallback = await demoAI.parseScope(text, jt);
        return { ...fallback, error: e instanceof Error ? e.message : 'Studwise request failed' };
      }
    },
    async extractPastJob(text) {
      try {
        const reply = await callClaude(apiKey, pastJobSystem(), [{ type: 'text', text }], 300);
        return cleanPastJob(parseReply(reply));
      } catch (e) {
        return { ...(await demoAI.extractPastJob(text)), error: e instanceof Error ? e.message : 'Studwise request failed' };
      }
    },
  };
}

/** Quick check that a key works. Returns null when OK, or a message to show. */
export async function testClaudeKey(apiKey: string): Promise<string | null> {
  try {
    await callClaude(apiKey, 'Reply with the single word OK.', [{ type: 'text', text: 'ping' }], 5);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : 'Studwise request failed';
  }
}

/** The `sample` function a claude.ai artifact page gets: Claude on the viewer's own Claude account. */
export type SampleFn = (
  input: string | ChatTurn[],
  options?: { images?: Blob[]; cache?: boolean },
) => Promise<{ text: string; truncated: boolean }>;

/** Turns a `sample` failure ({code, message}) into a message a contractor can act on. */
export function sampleErrorMessage(e: unknown): string {
  const code = typeof e === 'object' && e && 'code' in e ? String((e as { code: unknown }).code) : '';
  switch (code) {
    case 'not_granted':
    case 'sampling_disabled':
    case 'not_declared':
    case 'capability_disabled':
    case 'capability_removed':
      return 'Claude is not allowed on this page. Allow it in the page permissions, then try again.';
    case 'rate_limited':
      return 'Claude usage limit reached for now. Try again in a little while.';
    case 'session_expired':
      return 'Your Claude sign-in expired. Sign in again, then try again.';
    case 'image_rejected':
    case 'images_unavailable':
      return 'Studwise could not use these photos. Try fewer photos, or JPG/PNG files.';
    case 'refused':
      return 'Studwise would not answer this one. Reword the notes and try again.';
    default:
      return 'Studwise could not answer right now. Try again.';
  }
}

function base64ToBlob(img: ImageInput): Blob {
  const bin = atob(img.base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: img.mediaType });
}

/** Claude built into claude.ai: no API key needed, it runs on the viewer's own Claude plan. */
export function hostClaudeAI(getSample: () => Promise<SampleFn | null>): EstimatorAI {
  const ask = async (prompt: string, images?: ImageInput[], timeoutMs = CLAUDE_TIMEOUT_MS) => {
    const sample = await getSample();
    if (!sample) throw new Error('Claude is not available on this page.');
    let res: { text: string; truncated: boolean };
    try {
      // The page's AI has no timeout of its own: without one a lost request leaves "Reading the job" up forever.
      res = await Promise.race([
        sample(prompt, images?.length ? { images: images.map(base64ToBlob) } : undefined),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Studwise took too long to answer. Try again.')), timeoutMs)),
      ]);
    } catch (e) {
      if (e instanceof Error && /took too long/.test(e.message)) throw e;
      throw new Error(sampleErrorMessage(e));
    }
    if (res.truncated) throw new Error("Studwise's answer was cut off. Try a shorter description or fewer photos.");
    return res.text;
  };
  return {
    name: 'Studwise (built in)',
    async complete(prompt, images) {
      return ask(prompt, images?.slice(0, 8));
    },
    async chat(turns, system) {
      const sample = await getSample();
      if (!sample) throw new Error('Claude is not available on this page.');
      try {
        // No system role in the page API: the standing instructions are the first user turn.
        const res = await sample([{ role: 'user', content: system }, ...turns], { cache: false });
        return res.text;
      } catch (e) {
        throw new Error(sampleErrorMessage(e));
      }
    },
    async planJob(req, images, ctx) {
      const imgs = (images ?? []).slice(0, 8);
      const prompt = `${planSystem(req.wantVi)}${planContextText(ctx)}\n\n${planUserText(req, photoLine(imgs))}`;
      return planFromReply(await ask(prompt, imgs, PLAN_TIMEOUT_MS), req);
    },
    async parseScope(text, jobTypeId, images, ctx) {
      const jt = jobTypeId ?? guessJobType(text);
      const imgs = (images ?? []).slice(0, 8);
      const prompt = `${SCOPE_SYSTEM}${contextText(ctx)}\n\nJob type: ${jt ?? 'unknown — pick the best jobTypeId'}\nQuestions:\n${JSON.stringify(questionsFor(jt))}\n\n${photoLine(imgs)}Contractor notes:\n${text || '(no notes, use the photos)'}`;
      try {
        return cleanScopeResult(parseReply(await ask(prompt, imgs)), jt);
      } catch (e) {
        const fallback = await demoAI.parseScope(text, jt);
        return { ...fallback, error: e instanceof Error ? e.message : 'Studwise request failed' };
      }
    },
    async extractPastJob(text) {
      try {
        return cleanPastJob(parseReply(await ask(`${pastJobSystem()}\n\nText:\n${text}`)));
      } catch (e) {
        return { ...(await demoAI.extractPastJob(text)), error: e instanceof Error ? e.message : 'Studwise request failed' };
      }
    },
  };
}

export function getAI(opts: { apiKey?: string; host?: () => Promise<SampleFn | null>; cloud?: Exclude<ClaudeAuth, string> } = {}): EstimatorAI {
  if (opts.apiKey?.trim()) return directClaudeAI(opts.apiKey.trim());
  if (opts.cloud) return directClaudeAI(opts.cloud);
  if (opts.host) return hostClaudeAI(opts.host);
  const url = typeof process !== 'undefined' ? process.env.EXPO_PUBLIC_AI_URL : undefined;
  return url ? claudeAI(url) : demoAI;
}

/**
 * Asks the AI which type of work a description is, when the keyword reader could not tell (any language, or an
 * unusual way of saying it). Returns one of the given ids, or null when the AI is off or names none of them.
 */
export async function pickJobType(ai: EstimatorAI, text: string, types: { id: JobTypeId; name: string }[]): Promise<JobTypeId | null> {
  const list = types.slice(0, 80).map((t) => `${t.id}: ${t.name}`).join('\n');
  const reply = await ai.complete(`A contractor described a job. Which one type of work below fits it best?\nReply with ONLY the id before the colon, or "none" if nothing fits.\n\nTypes:\n${list}\n\nDescription:\n${text.slice(0, 1500)}`, undefined, 40);
  const said = reply.trim().toLowerCase();
  // Longest id first, so "bath-remodel" is not mistaken for "bath".
  return [...types].sort((a, b) => b.id.length - a.id.length).find((t) => said.includes(t.id.toLowerCase()))?.id ?? null;
}
