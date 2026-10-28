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
const NUM = '(\\d+(?:\\.\\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty)';
const toNum = (s: string) => (WORD_NUMS[s.toLowerCase()] ?? parseFloat(s));

function grab(text: string, pattern: string): number | undefined {
  const m = new RegExp(pattern, 'i').exec(text);
  return m ? toNum(m[1]) : undefined;
}

export function guessJobType(text: string): JobTypeId | undefined {
  const t = text.toLowerCase();
  if (/basement|adu conversion|convert|garage conversion|bedrooms?\b.*(to|into)/.test(t)) return 'basement';
  if (/dadu|new adu|detached adu|backyard cottage/.test(t)) return 'adu';
  if (/new (home|house|build|construction)/.test(t)) return 'newbuild';
  if (/kitchen/.test(t) && !/bath/.test(t)) return 'kitchen';
  if (/bath|shower|tub|vanity/.test(t)) return 'bathroom';
  if (/floor|lvp|laminate|hardwood/.test(t)) return 'flooring';
  if (/paint/.test(t)) return 'painting';
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
      answers[id] = v;
      heard.push(label);
    };
    const t = ` ${text} `;

    const wall = grab(t, `${NUM}\\s*(?:lf|linear\\s*f(?:ee|oo)t|ft|feet|foot)\\s*(?:of\\s*)?(?:new\\s*)?walls?`)
      ?? grab(t, `walls?[^.\\d]{0,20}${NUM}\\s*(?:lf|ft|feet)`);
    if (wall) set('newWallLf', wall, `${wall} LF new wall`);

    // Project size: an area NOT followed by "of tile" / "tile" (that's the tile area).
    const size = grab(t, `${NUM}\\s*(?:sf|sq\\.?\\s*ft|sqft|square\\s*f(?:ee|oo)t)(?!\\s*(?:of\\s*)?(?:new\\s*)?(?:floor\\s*)?tile)`);
    if (size) set('sizeSf', size, `${size} SF`);

    const tile = grab(t, `tiles?[^.\\d]{0,30}${NUM}\\s*(?:sf|sq|square)`) ?? grab(t, `${NUM}\\s*(?:sf|sq\\.?\\s*ft|sqft|square\\s*feet)\\s*(?:of\\s*)?tile`);
    if (tile) { set('tileSf', tile, `${tile} SF tile`); set('floorTileSf', tile, `${tile} SF floor tile`); }

    const showers = grab(t, `${NUM}\\s*(?:new\\s*)?(?:\\d+\\s*x\\s*\\d+\\s*)?showers?`);
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

    const doors = grab(t, `${NUM}\\s*(?:new\\s*)?(?:\\d+"?\\s*)?doors?`);
    if (doors) set('doors', doors, `${doors} doors`);
    if (/bi-?fold/i.test(t)) set('bifolds', grab(t, `${NUM}\\s*bi-?folds?`) ?? 1, 'bifold door');
    const lights = grab(t, `${NUM}\\s*(?:new\\s*)?(?:recessed\\s*|can\\s*)?lights?`);
    if (lights) set('lights', lights, `${lights} lights`);
    const switches = grab(t, `${NUM}\\s*switch(?:es)?`);
    if (switches) set('switches', switches, `${switches} switches`);
    const outlets = grab(t, `${NUM}\\s*(?:new\\s*)?(?:outlets?|receptacles?|plugs?)`);
    if (outlets) set('outlets', outlets, `${outlets} outlets`);
    const cab = grab(t, `${NUM}\\s*(?:lf|linear\\s*feet|ft|feet)\\s*(?:of\\s*)?cabinets?`);
    if (cab) set('cabinetLf', cab, `${cab} LF cabinets`);
    const drain = grab(t, `(?:drain|main)[^.\\d]{0,25}${NUM}\\s*(?:ft|feet)`);
    if (drain) set('drainDistanceFt', drain, `${drain} ft to main drain`);
    const panel = grab(t, `panel[^.\\d]{0,25}${NUM}\\s*(?:ft|feet)`);
    if (panel) set('panelDistanceFt', panel, `${panel} ft from panel`);

    if (/basement/i.test(t)) set('foundation', 'basement', 'basement slab');
    else if (/\bslab\b/i.test(t)) set('foundation', 'slab', 'slab foundation');
    else if (/crawl/i.test(t)) set('foundation', 'crawl', 'crawlspace');
    if (/laundry|washer/i.test(t)) set('washer', true, 'washer hookup');
    if (/dryer/i.test(t)) set('dryer30a', true, '30A dryer circuit');
    if (/range|stove/i.test(t)) set('range50a', true, '50A range circuit');
    if (/ice\s*maker|fridge|refrigerator/i.test(t)) set('iceMaker', true, 'ice maker line');
    if (/kitchen/i.test(t) && jt === 'basement') set('kitchenSink', true, 'kitchen sink');
    if (/stall/i.test(t)) set('showerType', 'stall', 'shower stall');
    if (/\btub\b/i.test(t)) set('showerType', 'tub', 'tub');
    if (/lvp|vinyl/i.test(t)) set('floorType', 'lvp', 'LVP flooring');
    if (/owner (?:supplies|supplied|buys)|client (?:supplies|supplied|buys)/i.test(t)) set('fixturesBy', 'owner', 'owner supplies fixtures');
    const year = grab(t, `(?:built|year)[^.\\d]{0,12}((?:18|19|20)\\d\\d)`);
    if (year) set('yearBuilt', year, `built ${year}`);

    return { jobTypeId: jt, answers, heard };
  },

  async extractPastJob(text) {
    const t = text.replace(/,/g, '');
    const prices = [...t.matchAll(/\$\s*(\d+(?:\.\d+)?)/g)].map((m) => parseFloat(m[1]));
    const totalMatch = /total[^$\d]{0,20}\$?\s*(\d+(?:\.\d+)?)/i.exec(t);
    const price = totalMatch ? parseFloat(totalMatch[1]) : prices.length ? Math.max(...prices) : undefined;
    const size = grab(t, `${NUM}\\s*(?:sf|sq\\.?\\s*ft|sqft|square\\s*f(?:ee|oo)t)`);
    const finish: FinishLevel | undefined = /high[- ]?end|luxury|premium|custom/i.test(t) ? 'high'
      : /basic|builder[- ]grade|economy|budget/i.test(t) ? 'basic' : /mid/i.test(t) ? 'mid' : undefined;
    const firstLine = text.split('\n').map((s) => s.trim()).find((s) => s.length > 3);
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
