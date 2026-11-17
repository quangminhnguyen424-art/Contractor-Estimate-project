import { jobType } from './jobTypes';
import type { Answers, Estimate, JobTypeId, Profile } from './types';

/**
 * Permit help for a job: which permits it needs, who issues them where the job is, what to prepare and the steps.
 * Washington State, Seattle–Tacoma area, as of November 2026:
 * - Seattle: building, electrical and mechanical permits from SDCI through the Seattle Services Portal; plumbing and
 *   gas piping from Public Health – Seattle & King County (also for Clyde Hill and unincorporated King County).
 * - MyBuildingPermit.com: Auburn, Bellevue, Bothell, Burien, Edmonds, Federal Way, Issaquah, Kenmore,
 *   King County (unincorporated), Kirkland, Mercer Island, Sammamish, Snoqualmie.
 * - Cities that issue their own electrical permits (L&I list): Bellevue, Burien, Des Moines, Federal Way, Kirkland,
 *   Mercer Island, Normandy Park, Redmond, Renton, Sammamish, SeaTac, Seattle, Tukwila, Everett, Lynnwood,
 *   Marysville, Mountlake Terrace, Milton; Tacoma Power for Tacoma, Fircrest, University Place, Fife, Lakewood and
 *   Steilacoom. Everywhere else: Washington L&I.
 * It is guidance; the city decides. The screen says so.
 */

export type PermitKind = 'building' | 'electrical' | 'plumbing' | 'mechanical';
export type Need = 'required' | 'likely' | 'check';

export interface Office { name: string; url: string }

export interface Jurisdiction {
  id: string;
  /** "Seattle", "Bellevue", "Unincorporated King County"… */
  name: string;
  offices: Record<PermitKind, Office>;
  /** Seattle: small jobs can get a same-week Subject-to-Field-Inspection permit. */
  stfi: boolean;
  known: boolean;
}

export interface PermitItem {
  kind: PermitKind;
  need: Need;
  /** Why (what in the job triggers it). */
  why: string;
  office: Office;
  /** What to prepare for this permit. */
  docs: string[];
  /** Who may apply for it. */
  who: string;
}

export interface PermitPlan {
  jurisdiction: Jurisdiction;
  items: PermitItem[];
  /** Nothing needs a permit (painting, flooring…). */
  none: boolean;
  steps: string[];
  /** Checklist ids and wording; the screen keeps which are done. */
  checklist: { id: string; text: string }[];
}

const SDCI: Office = { name: 'Seattle SDCI — Seattle Services Portal', url: 'https://cosaccela.seattle.gov/portal/welcome.aspx' };
const PHSKC: Office = { name: 'Public Health – Seattle & King County (Permit Center)', url: 'https://kingcounty.gov/en/dept/dph/health-safety/environmental-health/plumbing-gas-piping/applications-and-permits' };
const MBP: Office = { name: 'MyBuildingPermit.com', url: 'https://www.mybuildingpermit.com' };
const LNI: Office = { name: 'Washington L&I electrical permits', url: 'https://lni.wa.gov/licensing-permits/electrical/electrical-permits-fees-and-inspections/' };
const TACOMA_POWER: Office = { name: 'Tacoma Power electrical permits', url: 'https://www.mytpu.org/' };
const TACOMA: Office = { name: 'City of Tacoma Permits (Planning & Development Services)', url: 'https://www.tacomapermits.org' };
const PIERCE: Office = { name: 'Pierce County Planning & Public Works', url: 'https://www.piercecountywa.gov/ppw' };
const KING_DLS: Office = { name: 'King County Permitting (MyBuildingPermit.com)', url: 'https://www.mybuildingpermit.com' };

const MBP_CITIES = ['Auburn', 'Bellevue', 'Bothell', 'Burien', 'Edmonds', 'Federal Way', 'Issaquah', 'Kenmore', 'Kirkland', 'Mercer Island', 'Sammamish', 'Snoqualmie'];
const OWN_ELECTRICAL = ['Bellevue', 'Burien', 'Des Moines', 'Federal Way', 'Kirkland', 'Mercer Island', 'Normandy Park', 'Redmond', 'Renton', 'Sammamish', 'SeaTac', 'Seattle', 'Tukwila', 'Everett', 'Lynnwood', 'Marysville', 'Mountlake Terrace', 'Milton'];
const TACOMA_POWER_AREA = ['Tacoma', 'Fircrest', 'University Place', 'Fife', 'Lakewood', 'Steilacoom'];
/** Cities worth recognizing in a typed address (King, Pierce, south Snohomish). */
const CITIES = [
  ...MBP_CITIES, ...OWN_ELECTRICAL, ...TACOMA_POWER_AREA,
  'Kent', 'Shoreline', 'Lake Forest Park', 'Woodinville', 'Newcastle', 'Maple Valley', 'Covington', 'Black Diamond', 'Enumclaw', 'North Bend',
  'Duvall', 'Carnation', 'Clyde Hill', 'Medina', 'Yarrow Point', 'Hunts Point', 'Beaux Arts', 'Algona', 'Pacific', 'Puyallup', 'Sumner',
  'Bonney Lake', 'Gig Harbor', 'Edgewood', 'DuPont', 'Orting', 'Buckley', 'Mill Creek', 'Mukilteo', 'Lynnwood', 'Bothell',
];

const cityOffice = (city: string): Office => ({
  name: `City of ${city} permit center`,
  url: `https://www.google.com/search?q=${encodeURIComponent(`City of ${city} WA building permit`)}`,
});

/** The city named in a typed address ("…, Kent, WA 98030"), if it is one we know. */
export function cityFromAddress(address: string): string | null {
  const a = ` ${address.toLowerCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ')} `;
  const hit = [...new Set(CITIES)].sort((x, y) => y.length - x.length).find((c) => a.includes(` ${c.toLowerCase()} `));
  return hit ?? null;
}

const norm = (city: string) => {
  const c = city.trim().toLowerCase();
  return [...new Set(CITIES)].find((x) => x.toLowerCase() === c) ?? city.trim();
};

/**
 * Who issues what for a city. `county` is set when the lot is outside any city (from the parcel record):
 * "King" for unincorporated King County, "Pierce" for unincorporated Pierce County.
 */
export function jurisdictionFor(city: string | null, county?: 'King' | 'Pierce'): Jurisdiction {
  if (!city || /^king county$/i.test(city) || county === 'King' && !city) {
    return {
      id: 'king-county', name: 'Unincorporated King County', stfi: false, known: true,
      offices: { building: KING_DLS, mechanical: KING_DLS, plumbing: PHSKC, electrical: LNI },
    };
  }
  if (/^pierce county$/i.test(city) || county === 'Pierce') {
    return { id: 'pierce-county', name: 'Unincorporated Pierce County', stfi: false, known: true, offices: { building: PIERCE, mechanical: PIERCE, plumbing: PIERCE, electrical: LNI } };
  }
  const name = norm(city);
  if (name === 'Seattle') {
    return { id: 'seattle', name: 'Seattle', stfi: true, known: true, offices: { building: SDCI, electrical: SDCI, mechanical: SDCI, plumbing: PHSKC } };
  }
  const mbp = MBP_CITIES.includes(name);
  const local = name === 'Tacoma' ? TACOMA : mbp ? MBP : cityOffice(name);
  const electrical = OWN_ELECTRICAL.includes(name) ? local : TACOMA_POWER_AREA.includes(name) ? TACOMA_POWER : LNI;
  return {
    id: name.toLowerCase().replace(/\s+/g, '-'), name, stfi: false, known: CITIES.includes(name),
    offices: { building: local, mechanical: local, plumbing: name === 'Clyde Hill' ? PHSKC : local, electrical },
  };
}

// ── What each kind of work needs ──────────────────────────────────────────────────────────────────────────────

type Rule = Partial<Record<PermitKind, [Need, string]>>;

const NEW_BUILD: Rule = {
  building: ['required', 'New building'],
  electrical: ['required', 'New wiring and service'],
  plumbing: ['required', 'New plumbing and water/sewer connections'],
  mechanical: ['required', 'Heating, ventilation and any gas appliances'],
};

const RULES: Partial<Record<JobTypeId, Rule>> = {
  adu: NEW_BUILD,
  newbuild: NEW_BUILD,
  addition: { building: ['required', 'Adds floor area to the house'], electrical: ['required', 'New circuits in the addition'], plumbing: ['check', 'Only if the addition has plumbing'], mechanical: ['check', 'If heating or ducts are extended'] },
  garage: { building: ['required', 'Turns a garage into living space (change of use)'], electrical: ['required', 'New circuits and outlets'], plumbing: ['check', 'Only if adding a bathroom or kitchen'], mechanical: ['likely', 'Heating for the new room'] },
  basement: { building: ['likely', 'Finishing or converting a basement, new walls or bedrooms'], electrical: ['required', 'New circuits and outlets'], plumbing: ['check', 'If a bathroom, kitchen or laundry is added or moved'], mechanical: ['check', 'If heating, ducts or bath fans are added'] },
  wholehouse: { building: ['required', 'Remodel with walls, structure or layout changes'], electrical: ['required', 'Wiring changes'], plumbing: ['likely', 'Fixtures moved or replaced'], mechanical: ['check', 'If heating or ventilation changes'] },
  commercial: { building: ['required', 'Tenant improvement'], electrical: ['required', 'Wiring changes'], plumbing: ['check', 'If fixtures are added or moved'], mechanical: ['likely', 'HVAC changes'] },
  kitchen: { building: ['check', 'Only if walls, windows or structure change (cabinets and counters alone usually do not)'], electrical: ['likely', 'New or moved circuits and outlets'], plumbing: ['likely', 'Sink, dishwasher or gas line moved or added'], mechanical: ['check', 'Range hood over 400 CFM or a new gas appliance'] },
  bathroom: { building: ['check', 'Only if walls or structure change'], electrical: ['likely', 'New or moved circuits, fan, heated floor'], plumbing: ['likely', 'Fixtures replaced, moved or added'], mechanical: ['check', 'New exhaust fan ducting'] },
  roofing: { building: ['check', 'Many cities need a re-roof permit, and all do when sheathing or structure is replaced'] },
  siding: { building: ['check', 'Some cities need a permit for re-siding; all do for structural repair'] },
  windows: { building: ['check', 'Needed when openings change size; same-size replacement often is not'] },
  deck: { building: ['likely', 'Decks over 30 inches above grade or over 200 SF, or attached to the house'] },
  retaining: { building: ['check', 'Walls over 4 ft (measured from the bottom of the footing) or holding a slope or driveway'] },
  fence: { building: ['check', 'Fences over 7 ft tall'] },
  panel: { electrical: ['required', 'Service or panel change'] },
  rewire: { electrical: ['required', 'Rewiring'], building: ['check', 'If walls are opened for structural work'] },
  repipe: { plumbing: ['required', 'Replacing water piping'] },
  waterheater: { plumbing: ['required', 'Water heater replacement (gas piping included)'], electrical: ['check', 'Electric or heat-pump water heaters need a circuit'] },
  hvac: { mechanical: ['required', 'New heating or cooling equipment'], electrical: ['required', 'Circuit for the heat pump or air handler'] },
  demolition: { building: ['check', 'Demolishing structure or a whole building needs a demolition permit'] },
  insulation: { building: ['check', 'Usually no permit; some cities inspect wall insulation in remodels'] },
  concrete: { building: ['check', 'Flatwork usually needs none; driveways onto the street need a right-of-way permit'] },
  landscape: { building: ['check', 'Grading over 50 cubic yards or work on a steep slope needs a grading permit'] },
};

const DOCS: Record<PermitKind, (stfi: boolean, big: boolean, seattle: boolean) => string[]> = {
  building: (stfi, big, seattle) => [
    'Parcel number and legal description',
    'Site plan to scale: lot lines, buildings, setbacks, the work area',
    'Floor plans to scale, existing and proposed',
    ...(big ? ['Elevations and building sections', 'Structural drawings and engineering (foundation, framing, lateral)', 'Washington State Energy Code compliance forms', 'Drainage / stormwater plan', 'Survey and, on slopes, a geotechnical report', ...(seattle ? ['Tree plan (Seattle: trees 6 inches and wider)'] : [])] : ['Details of any structural change (beam sizes, posts, headers)']),
    ...(stfi ? ['Small job in Seattle: ask for Subject-to-Field-Inspection (STFI) — no plan review if under 750 SF of land disturbed and not in an environmentally critical area'] : []),
    'Project value (the contract price) for the fee',
    'Contractor registration number and business license',
  ],
  electrical: (_s, _b, seattle) => ['Load calculation for a service or panel change', 'Circuit list / panel schedule', 'Equipment specs (heat pump, EV charger, solar)', ...(seattle ? ['Heat equipment sizing form when electric heat is the main heat (Seattle)'] : [])],
  plumbing: () => ['Fixture count (each sink, toilet, shower, water heater)', 'Gas piping sketch with lengths and appliance BTUs, if gas'],
  mechanical: () => ['Equipment make, model and specs', 'Heat loss / equipment sizing form', 'Duct or line-set layout'],
};

const WHO: Record<PermitKind, string> = {
  building: 'A registered contractor or the owner. Bring the owner’s authorization if you apply for them.',
  electrical: 'A licensed electrical contractor, or an owner doing work on the home they live in.',
  plumbing: 'A registered plumbing contractor, or a homeowner doing their own home.',
  mechanical: 'A registered contractor (gas work needs a certified gas piping installer), or the owner.',
};

const ORDER: PermitKind[] = ['building', 'electrical', 'plumbing', 'mechanical'];

/** Whether the answers say a trade is touched at all ("Moving the toilet?" yes…). Unknown answers keep the rule. */
function adjust(kind: PermitKind, need: Need, a: Answers): Need {
  const yes = (k: string) => a[k] === true || a[k] === 'yes';
  if (kind === 'plumbing' && need !== 'required' && (yes('movePlumbing') || yes('moveToilet') || yes('addBath') || yes('newBath'))) return 'required';
  if (kind === 'electrical' && need !== 'required' && (yes('newCircuits') || yes('addLights') || yes('moveElectrical'))) return 'required';
  if (kind === 'building' && need !== 'required' && (yes('moveWalls') || yes('removeWall') || yes('structural'))) return 'required';
  return need;
}

export function permitPlan(input: { jobTypeId: JobTypeId; answers: Answers; city: string | null; county?: 'King' | 'Pierce' }): PermitPlan {
  const j = jurisdictionFor(input.city, input.county);
  const rule = RULES[input.jobTypeId] ?? {};
  const big = ['adu', 'newbuild', 'addition', 'commercial'].includes(input.jobTypeId);
  const items: PermitItem[] = ORDER.filter((k) => rule[k]).map((k) => {
    const [need, why] = rule[k]!;
    return { kind: k, need: adjust(k, need, input.answers), why, office: j.offices[k], docs: DOCS[k](j.stfi && !big, big, j.id === 'seattle'), who: WHO[k] };
  });
  const none = items.length === 0;
  const steps = none ? [] : [
    `Confirm the job is in ${j.name} (the parcel record shows the city) and check zoning and critical areas for the lot.`,
    'Get the owner’s authorization if you apply for them, and your contractor registration and business license numbers ready.',
    'Prepare the drawings and forms listed under each permit.',
    `Apply online${items[0] ? ` at ${items[0].office.name}` : ''}. Trade permits (electrical, plumbing, mechanical) are separate applications.`,
    'Pay the intake fees, then answer any correction letters until the permit is issued.',
    'Print the permit and approved plans and keep them on site.',
    'Schedule each inspection before covering the work (footing, framing, rough-ins, insulation, final).',
    'Pass the final inspection and keep the signed permit card with the job records.',
  ];
  const checklist = none ? [] : [
    { id: 'parcel', text: 'Parcel number and zoning confirmed' },
    { id: 'auth', text: 'Owner authorization signed' },
    { id: 'plans', text: 'Drawings and forms ready' },
    ...items.map((i) => ({ id: `apply-${i.kind}`, text: APPLIED[i.kind] })),
    { id: 'fees', text: 'Fees paid' },
    ...items.map((i) => ({ id: `issued-${i.kind}`, text: ISSUED[i.kind] })),
    { id: 'posted', text: 'Permit posted on site' },
    { id: 'final', text: 'Final inspection passed' },
  ];
  return { jurisdiction: j, items, none, steps, checklist };
}

export function label(k: PermitKind): string {
  return { building: 'Building', electrical: 'Electrical', plumbing: 'Plumbing', mechanical: 'Mechanical' }[k];
}
/** Whole phrases (not "{kind} permit"), so each language gets a full sentence to translate. */
export const PERMIT_TITLE: Record<PermitKind, string> = { building: 'Building permit', electrical: 'Electrical permit', plumbing: 'Plumbing permit', mechanical: 'Mechanical permit' };
const APPLIED: Record<PermitKind, string> = { building: 'Building permit applied for', electrical: 'Electrical permit applied for', plumbing: 'Plumbing permit applied for', mechanical: 'Mechanical permit applied for' };
const ISSUED: Record<PermitKind, string> = { building: 'Building permit issued', electrical: 'Electrical permit issued', plumbing: 'Plumbing permit issued', mechanical: 'Mechanical permit issued' };

// ── The application, filled in ──────────────────────────────────────────────────────────────────────────────

export interface PermitState {
  /** Checklist items done. */
  done?: string[];
  /** From the county parcel record. */
  parcel?: { pin: string; city: string; zoning: string; lotSqft: number };
  /** The "description of work" for the application (Studwise writes it; the contractor can edit). */
  description?: string;
}

export interface ApplicationField { label: string; value: string }

/** The fields every permit application asks for, filled from the job and the company profile. */
export function applicationFields(est: Estimate, profile: Profile, permit: PermitState | undefined, jurisdictionName: string): ApplicationField[] {
  let jt;
  try { jt = jobType(est.jobTypeId); } catch { jt = null; }
  const value = Math.round((est.total ?? 0) - (est.tax ?? 0));
  const size = est.comparison?.sizeSf > 0 && jt && jt.unit === 'SF' ? `${est.comparison.sizeSf.toLocaleString('en-US')} SF` : '';
  const kind = ['adu', 'newbuild'].includes(est.jobTypeId) ? 'New construction' : est.jobTypeId === 'addition' ? 'Addition' : 'Alteration / repair';
  const f: ApplicationField[] = [
    { label: 'Site address', value: est.address },
    { label: 'Jurisdiction', value: jurisdictionName },
    { label: 'Parcel number (APN)', value: permit?.parcel?.pin ?? '' },
    { label: 'Zoning', value: permit?.parcel?.zoning ?? '' },
    { label: 'Lot size', value: permit?.parcel?.lotSqft ? `${permit.parcel.lotSqft.toLocaleString('en-US')} SF` : '' },
    { label: 'Owner', value: est.clientName },
    { label: 'Type of work', value: kind },
    { label: 'Work area', value: size },
    { label: 'Project value', value: value > 0 ? `$${value.toLocaleString('en-US')}` : '' },
    { label: 'Contractor', value: profile.companyName },
    { label: 'Contact', value: [profile.contactName, profile.phone, profile.email].filter(Boolean).join(' · ') },
    { label: 'Contractor registration #', value: profile.license },
    { label: 'Description of work', value: permit?.description ?? '' },
  ];
  return f;
}

/** For the AI: write the application's "description of work" the way plan reviewers expect it. */
export function permitDescriptionPrompt(est: Estimate, items: PermitItem[], learned = ''): string {
  let name = est.jobTypeId as string;
  try { name = jobType(est.jobTypeId).name; } catch { /* custom type */ }
  const size = est.comparison?.sizeSf > 0 ? ` (about ${est.comparison.sizeSf} SF)` : '';
  const byTrade = new Map<string, string[]>();
  for (const l of est.lines ?? []) if (l.qty > 0) byTrade.set(l.trade, [...(byTrade.get(l.trade) ?? []), `${l.name} (${l.qty} ${l.unit})`]);
  const sections = [...byTrade].map(([t, ls]) => `- ${t}: ${ls.slice(0, 12).join('; ')}`).join('\n');
  return [
    'You are a Washington State general contractor filling in a building permit application.',
    `Job: ${name}${size}.`,
    est.description.trim() ? `Contractor's notes:\n${est.description.trim().slice(0, 2500)}` : '',
    sections ? `Work in the estimate:\n${sections.slice(0, 3000)}` : '',
    `Permits planned: ${items.map((i) => label(i.kind)).join(', ') || 'building'}.`,
    learned ? `How this contractor writes (descriptions they used before; match their style):\n${learned}` : '',
    '',
    'Write the "Description of work" for the permit application: 2 to 4 short sentences, in the style plan reviewers expect',
    '(e.g. "Alter existing single-family residence: remodel one bathroom (60 SF) including new fixtures in the same locations, new exhaust fan and GFCI circuits. No structural changes. Electrical and plumbing under separate permits.").',
    'Say what is built or altered, where in the house, sizes, whether structure changes, and which trades are under separate permits.',
    'No prices, no client names or addresses, no brand names. Plain English. Reply with the description only.',
  ].filter(Boolean).join('\n');
}
