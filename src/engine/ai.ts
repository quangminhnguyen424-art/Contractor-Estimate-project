import { JOB_TYPE_BY_ID } from './jobTypes';
import type { Answers, FinishLevel, JobTypeId } from './types';

/**
 * The AI layer. Phase 1 ships with DemoAI (runs on the phone, no internet).
 * ClaudeAI calls our own backend, which holds the Anthropic API key —
 * the key must never be put inside the app.
 */
export interface ScopeResult {
  jobTypeId?: JobTypeId;
  answers: Answers;
  heard: string[]; // human-readable list of what was picked up
}

export interface PastJobResult {
  jobTypeId?: JobTypeId;
  sizeSf?: number;
  price?: number;
  finish?: FinishLevel;
  title?: string;
}

export interface EstimatorAI {
  name: string;
  parseScope(text: string, jobTypeId?: JobTypeId): Promise<ScopeResult>;
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
  if (/basement|adu conversion|garage conversion|convert (?:the |a |my )?(?:garage|basement|attic)|\d+ rooms? (?:to|into) \d+ bed/.test(t)) return 'basement';
  if (/dadu|new adu|detached adu|backyard cottage/.test(t)) return 'adu';
  if (/new (?:home|house|build|construction)/.test(t)) return 'newbuild';
  if (/kitchen/.test(t) && !/bath/.test(t)) return 'kitchen';
  if (/bath|shower|\btub\b|vanity|toilet/.test(t)) return 'bathroom';
  if (/paint/.test(t)) return 'painting';
  if (/floor|lvp|laminate|hardwood/.test(t)) return 'flooring';
  return undefined;
}

/** Rule-based stand-in for Claude: pulls quantities out of a spoken or typed job description. */
export const demoAI: EstimatorAI = {
  name: 'Demo AI (offline)',
  async parseScope(text, jobTypeId) {
    const jt = jobTypeId ?? guessJobType(text);
    const answers: Answers = {};
    const heard: string[] = [];
    const set = (id: string, v: number | string | boolean, label: string) => {
      if (jt && !JOB_TYPE_BY_ID[jt].questions.some((q) => q.id === id)) return;
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
    const year = grab(t, `(?:built|year)[^.\\d]{0,12}((?:18|19|20)\\d\\d)`);
    if (year) set('yearBuilt', year, `built ${year}`);

    return { jobTypeId: jt, answers, heard };
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
    name: 'Claude',
    async parseScope(text, jobTypeId) {
      try {
        return await post<ScopeResult>('/parse-scope', { text, jobTypeId, questions: jobTypeId ? JOB_TYPE_BY_ID[jobTypeId].questions : undefined });
      } catch {
        return demoAI.parseScope(text, jobTypeId); // fall back so the contractor is never stuck
      }
    },
    async extractPastJob(text) {
      try {
        return await post<PastJobResult>('/extract-past-job', { text });
      } catch {
        return demoAI.extractPastJob(text);
      }
    },
  };
}

export function getAI(): EstimatorAI {
  const url = typeof process !== 'undefined' ? process.env.EXPO_PUBLIC_AI_URL : undefined;
  return url ? claudeAI(url) : demoAI;
}
