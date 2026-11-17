/**
 * "Can I build an ADU here?": a first read of a lot from public data (King County parcel records) and the rules in
 * force in Washington. It is a starting point for a homeowner, never a permit decision, and every result says so.
 *
 * Rules as of November 2026:
 * - Seattle (Ord. 127211/127219, June 30 2025; Ord. 127376, Jan 21 2026): two ADUs per lot, attached or detached;
 *   up to 1,000 SF (1,200 SF with three or more bedrooms); no minimum lot size; no owner occupancy; no parking;
 *   32 ft height in NR zones; 5 ft rear setback (0 at an alley); side 5 ft average, 3 ft minimum; 5 ft between
 *   buildings; NR lots allow the greater of 4 homes or one per 1,250 SF of lot (6 near major transit or with two
 *   affordable homes).
 * - Other cities and urban unincorporated areas (RCW 36.70A.681, HB 1337, in force since mid-2025): at least two
 *   ADUs per lot, no size cap below 1,000 SF, no owner-occupancy rule; each city's own code sets the rest.
 */

export interface AduInput {
  /** City from the parcel record ("Seattle", "Kent"), or "King County" for unincorporated land. */
  city: string;
  /** The zoning code on the parcel record ("NR", "R-6", "RA-5"); empty when unknown. */
  zoning: string;
  lotSqft: number;
  /** The assessor's present use ("Single Family(Res Use/Zone)", "Vacant(Single-family)"). */
  use?: string;
}

export type Verdict = 'yes' | 'likely' | 'check' | 'no';
export type Place = 'seattle' | 'city' | 'urban-county' | 'rural-county';

export interface AduSize { sf: number; beds: 1 | 2 | 3 }

export interface AduResult {
  verdict: Verdict;
  place: Place;
  /** Why the verdict is what it is (keys for aduText). */
  reasons: AduReason[];
  /** ADUs allowed on the lot (state minimum outside Seattle). */
  adus: number;
  /** Largest ADU the rules allow without more bedrooms; 0 when not known. */
  maxSf: number;
  /** Seattle: the larger size allowed with three or more bedrooms. */
  maxSfBig?: number;
  /** Seattle Neighborhood Residential: homes allowed on the lot under middle-housing rules. */
  homes?: number;
  homesNearTransit?: number;
  /** Sizes worth pricing on this lot. */
  sizes: AduSize[];
  vacant: boolean;
  /** Detailed rules for the full report. */
  rules: { key: RuleKey; value: string }[];
  /** What the owner must still confirm (keys for aduText). */
  checks: CheckKey[];
}

export type AduReason = 'seattle-res' | 'seattle-lowrise' | 'seattle-other' | 'state-law' | 'rural' | 'not-res' | 'multi' | 'unknown-zone' | 'small-lot';
export type RuleKey = 'adus' | 'size' | 'height' | 'rear' | 'side' | 'between' | 'lotMin' | 'owner' | 'parking' | 'homes' | 'coverage';
export type CheckKey = 'critical' | 'trees' | 'utilities' | 'covenants' | 'cityCode' | 'transit' | 'septic' | 'survey';

const SEATTLE = /^seattle$/i;
const COUNTY = /^(king county|unincorporated|uninc)/i;

/** Rough zoning families from the code on the parcel record. */
function zoneFamily(city: string, zoning: string, use: string): 'res' | 'lowrise' | 'multi' | 'rural' | 'other' | 'unknown' {
  const z = zoning.trim().toUpperCase();
  const u = use.toLowerCase();
  if (/condo|apartment|mobile home park/.test(u)) return 'multi';
  if (!z) return /single family|duplex|triplex|vacant\(single/.test(u) ? 'res' : 'unknown';
  if (SEATTLE.test(city)) {
    if (/^(NR|RSL|SF)/.test(z)) return 'res';
    if (/^LR/.test(z)) return 'lowrise';
    return 'other';
  }
  if (/^(RA|A-|F$|F-|RURAL)/.test(z)) return 'rural';
  if (/^(NR|R|RS|SR|RSX|RSE|RSL|UR|SF|RL|RM|MDR|LDR)/.test(z)) return /^(RM|MDR)/.test(z) ? 'lowrise' : 'res';
  return 'other';
}

const fmt = (n: number) => n.toLocaleString('en-US');

/** Sizes worth pricing: a one-bedroom, a two-bedroom at the cap, and a three-bedroom where the rules allow it. */
function sizesFor(maxSf: number, big?: number): AduSize[] {
  const cap = maxSf || 1000;
  const out: AduSize[] = [{ sf: Math.min(600, cap), beds: 1 }, { sf: Math.min(800, cap), beds: 2 }];
  if (cap > 800) out.push({ sf: cap, beds: 2 });
  if (big && big > cap) out.push({ sf: big, beds: 3 });
  return out.filter((s, i, a) => a.findIndex((x) => x.sf === s.sf) === i);
}

export function checkAdu(input: AduInput): AduResult {
  const city = input.city.trim();
  const use = input.use ?? '';
  const lot = Math.max(0, Math.round(input.lotSqft || 0));
  const fam = zoneFamily(city, input.zoning, use);
  const vacant = /vacant/i.test(use);
  const seattle = SEATTLE.test(city);
  const place: Place = seattle ? 'seattle' : COUNTY.test(city) ? (fam === 'rural' ? 'rural-county' : 'urban-county') : 'city';
  const reasons: AduReason[] = [];
  const checks: CheckKey[] = [];
  const rules: AduResult['rules'] = [];
  let verdict: Verdict = 'check';
  let adus = 0;
  let maxSf = 0;
  let maxSfBig: number | undefined;
  let homes: number | undefined;
  let homesNearTransit: number | undefined;

  if (fam === 'multi') {
    reasons.push('multi');
    verdict = 'no';
  } else if (seattle) {
    if (fam === 'res' || fam === 'lowrise') {
      verdict = 'yes';
      reasons.push(fam === 'res' ? 'seattle-res' : 'seattle-lowrise');
      adus = 2; maxSf = 1000; maxSfBig = 1200;
      rules.push({ key: 'adus', value: '2' }, { key: 'size', value: `${fmt(1000)}|${fmt(1200)}` });
      if (fam === 'res') {
        homes = Math.max(4, Math.floor(lot / 1250));
        homesNearTransit = Math.max(6, homes);
        rules.push(
          { key: 'height', value: '32' }, { key: 'rear', value: '5' }, { key: 'side', value: '5|3' }, { key: 'between', value: '5' },
          { key: 'coverage', value: '50' }, { key: 'homes', value: `${homes}|${homesNearTransit}` },
        );
      }
      rules.push({ key: 'lotMin', value: '' }, { key: 'owner', value: '' }, { key: 'parking', value: '' });
      checks.push('critical', 'trees', 'utilities', 'transit', 'survey');
    } else {
      reasons.push(fam === 'unknown' ? 'unknown-zone' : 'seattle-other');
      verdict = 'check';
      checks.push('cityCode', 'critical');
    }
  } else if (fam === 'rural') {
    reasons.push('rural');
    verdict = 'check';
    adus = 1;
    checks.push('cityCode', 'septic', 'critical');
  } else if (fam === 'res' || fam === 'lowrise' || (fam === 'unknown' && /single family|vacant\(single/i.test(use))) {
    verdict = 'likely';
    reasons.push('state-law');
    adus = 2; maxSf = 1000;
    rules.push({ key: 'adus', value: '2' }, { key: 'size', value: fmt(1000) }, { key: 'owner', value: '' });
    checks.push('cityCode', 'critical', 'trees', 'utilities', 'survey');
  } else if (fam === 'unknown') {
    reasons.push('unknown-zone');
    checks.push('cityCode');
  } else {
    reasons.push('not-res');
    verdict = 'no';
    checks.push('cityCode');
  }

  // Very small lots can hold an attached ADU (in or on the house) more easily than a separate cottage.
  if (lot > 0 && lot < 3200 && (verdict === 'yes' || verdict === 'likely')) reasons.push('small-lot');
  if (verdict !== 'no') checks.push('covenants');

  return {
    verdict, place, reasons, adus, maxSf, maxSfBig, homes, homesNearTransit,
    sizes: verdict === 'no' ? [] : sizesFor(maxSf, maxSfBig), vacant, rules, checks: [...new Set(checks)],
  };
}

/** A price range for one size from the contractor's own price per SF, rounded to the nearest $5,000. */
export function aduCost(sf: number, perSf: { low: number; high: number }): { low: number; high: number } | null {
  if (!(perSf.low > 0) || !(perSf.high > 0) || !(sf > 0)) return null;
  const r = (n: number) => Math.round(n / 5000) * 5000;
  const lo = Math.min(perSf.low, perSf.high);
  const hi = Math.max(perSf.low, perSf.high);
  return { low: r(sf * lo), high: Math.max(r(sf * hi), r(sf * lo)) };
}
