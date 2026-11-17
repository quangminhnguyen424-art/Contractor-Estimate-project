/**
 * Looking up a lot in King County's public parcel records: the address → parcel number, city, zoning, lot size and
 * present use. King County GIS allows these calls from any web page or app (no key). Outside King County nothing is
 * found and the caller asks the user instead.
 */

export interface Parcel {
  pin: string;
  address: string;
  city: string; // "Seattle", or "King County" for unincorporated land
  zip: string;
  zoning: string;
  lotSqft: number;
  use: string;
}

const GIS = 'https://gismaps.kingcounty.gov/arcgis/rest/services';
const GEOCODE = `${GIS}/Address/Composite_locator/GeocodeServer/findAddressCandidates`;
const PARCELS = `${GIS}/Property/KingCo_PropertyInfo/MapServer/2/query`;
const FIELDS = 'PIN,ADDR_FULL,CTYNAME,POSTALCTYNAME,ZIP5,KCA_ZONING,LOTSQFT,PREUSE_DESC';

type Fetch = (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

interface Candidate { address: string; score: number; location: { x: number; y: number }; attributes?: { User_fld?: string } }

// "9336 35TH AVE NE" -> "9336 35th Ave NE": directions stay in capitals.
const title = (s: string) => s.toLowerCase().replace(/\b[a-z]+/g, (w) => (/^(ne|nw|se|sw|n|s|e|w)$/.test(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)));

export function readParcel(a: Record<string, unknown>): Parcel | null {
  const pin = String(a.PIN ?? '').trim();
  if (!/^\d{10}$/.test(pin)) return null;
  const cty = String(a.CTYNAME ?? '').trim();
  const postal = String(a.POSTALCTYNAME ?? '').trim();
  const addr = String(a.ADDR_FULL ?? '').trim();
  return {
    pin,
    address: addr ? `${title(addr)}${postal ? `, ${title(postal)}` : ''}` : '',
    // The assessor leaves the city empty for unincorporated land.
    city: cty ? title(cty) : 'King County',
    zip: String(a.ZIP5 ?? '').trim(),
    zoning: String(a.KCA_ZONING ?? '').trim(),
    lotSqft: Math.max(0, Math.round(Number(a.LOTSQFT) || 0)),
    use: String(a.PREUSE_DESC ?? '').replace(/\s+/g, ' ').trim(),
  };
}

async function getJson(f: Fetch, url: string): Promise<Record<string, unknown>> {
  const r = await f(url);
  if (!r.ok) throw new Error('lookup failed');
  return (await r.json()) as Record<string, unknown>;
}

/**
 * Up to three matching lots for a typed address, best first. Empty when the address is not in King County.
 * Throws only when the county's service cannot be reached.
 */
export async function findParcels(address: string, f: Fetch = fetch as unknown as Fetch): Promise<Parcel[]> {
  const q = address.trim();
  if (q.length < 5) return [];
  const geo = await getJson(f, `${GEOCODE}?SingleLine=${encodeURIComponent(q)}&outFields=User_fld&maxLocations=5&f=json`);
  // A point address carrying a parcel number can score lower than a street-range match when the city is typed.
  const all = (geo.candidates as Candidate[] | undefined) ?? [];
  const cands = all.filter((c) => c.score >= (/^\d{10}$/.test(c.attributes?.User_fld ?? '') ? 70 : 85));
  if (!cands.length) return [];
  const house = /^\s*(\d+)/.exec(q)?.[1];
  const sameHouse = (p: Parcel) => !house || p.address.startsWith(`${house} `);
  const pins = [...new Set(cands.map((c) => c.attributes?.User_fld ?? '').filter((p) => /^\d{10}$/.test(p)))].slice(0, 3);
  let found: Parcel[] = [];
  if (pins.length) {
    const where = encodeURIComponent(`PIN IN (${pins.map((p) => `'${p}'`).join(',')})`);
    const res = await getJson(f, `${PARCELS}?where=${where}&outFields=${FIELDS}&returnGeometry=false&f=json`);
    const rows = ((res.features as { attributes: Record<string, unknown> }[] | undefined) ?? []).map((x) => readParcel(x.attributes)).filter((p): p is Parcel => !!p);
    found = pins.map((p) => rows.find((r) => r.pin === p)).filter((p): p is Parcel => !!p).filter(sameHouse);
  }
  if (!found.length) {
    // A street-range match has no parcel number: take the lot at that point with the same house number.
    const best = [...cands].sort((a, b) => b.score - a.score)[0];
    const { x, y } = best.location;
    const geom = encodeURIComponent(JSON.stringify({ x, y, spatialReference: { wkid: 2926 } }));
    const res = await getJson(f, `${PARCELS}?geometry=${geom}&geometryType=esriGeometryPoint&inSR=2926&distance=60&units=esriSRUnit_Foot&spatialRel=esriSpatialRelIntersects&outFields=${FIELDS}&returnGeometry=false&f=json`);
    const near = ((res.features as { attributes: Record<string, unknown> }[] | undefined) ?? []).map((x) => readParcel(x.attributes)).filter((p): p is Parcel => !!p);
    found = near.filter(sameHouse).slice(0, 1);
  }
  return found;
}

/** The county's own page for a parcel (owner, permits, taxes), to link to. */
export const parcelViewer = (pin: string) => `https://blue.kingcounty.com/Assessor/eRealProperty/Detail.aspx?ParcelNbr=${pin}`;
