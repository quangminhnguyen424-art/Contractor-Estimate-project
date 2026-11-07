// Roof from satellite: address -> location -> Google Solar "building insights" (every roof plane's area, pitch and
// direction) + ground elevation (for the height) + a satellite photo. The Google key stays on the server.
// Signed-in accounts only; each measurement counts toward the daily AI limit.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { cors, json } from '../_shared/http.ts';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const KEY = Deno.env.get('GOOGLE_MAPS_API_KEY') ?? '';
const DAILY_LIMIT = Number(Deno.env.get('AI_DAILY_LIMIT') ?? '150');

const g = (path: string, params: Record<string, string>) =>
  `https://maps.googleapis.com/maps/api/${path}?${new URLSearchParams({ ...params, key: KEY })}`;

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!KEY) return json({ error: 'Satellite measuring is not set up on the server yet.' }, 503);

  const userClient = createClient(URL_, ANON, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: 'Please sign in again.' }, 401);

  let body: { address?: unknown; lat?: unknown; lng?: unknown };
  try { body = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }

  const admin = createClient(URL_, SERVICE);
  const { data: allowed, error: limitErr } = await admin.rpc('use_ai', { p_user: user.id, p_limit: DAILY_LIMIT });
  if (limitErr) return json({ error: 'Usage check failed. Try again.' }, 500);
  if (!allowed) return json({ error: `Today's limit (${DAILY_LIMIT}) is used up. It resets tomorrow.` }, 429);

  // 1. Where is it?
  let lat = Number(body.lat), lng = Number(body.lng);
  let address = typeof body.address === 'string' ? body.address.trim().slice(0, 200) : '';
  if (!(Number.isFinite(lat) && Number.isFinite(lng))) {
    if (!address) return json({ error: 'Enter the job address.' }, 400);
    const geo = await fetch(g('geocode/json', { address })).then((r) => r.json()).catch(() => null);
    const hit = geo?.results?.[0];
    if (!hit) return json({ error: 'Could not find that address. Check the street, city and ZIP.' }, 404);
    lat = hit.geometry.location.lat; lng = hit.geometry.location.lng;
    address = hit.formatted_address ?? address;
  }

  // 2. The roof planes, the ground's elevation and a photo, all at once.
  const solarUrl = `https://solar.googleapis.com/v1/buildingInsights:findClosest?${new URLSearchParams({
    'location.latitude': String(lat), 'location.longitude': String(lng), requiredQuality: 'LOW', key: KEY,
  })}`;
  const [solarRes, elev, photo] = await Promise.all([
    fetch(solarUrl),
    fetch(g('elevation/json', { locations: `${lat},${lng}` })).then((r) => r.json()).catch(() => null),
    fetch(g('staticmap', { center: `${lat},${lng}`, zoom: '20', size: '640x400', scale: '2', maptype: 'satellite' }))
      .then(async (r) => (r.ok ? `data:${r.headers.get('content-type') ?? 'image/png'};base64,${toBase64(new Uint8Array(await r.arrayBuffer()))}` : null))
      .catch(() => null),
  ]);
  if (solarRes.status === 404) {
    return json({ error: 'Google has no 3D roof data for this address yet. Enter the measurements by hand.', address, lat, lng, image: photo }, 404);
  }
  if (!solarRes.ok) return json({ error: `The satellite service did not answer (${solarRes.status}). Try again in a minute.` }, 502);
  const s = await solarRes.json();

  // Only what the app needs.
  const segs = (s.solarPotential?.roofSegmentStats ?? []).map((x: Record<string, any>) => ({
    pitchDegrees: x.pitchDegrees, azimuthDegrees: x.azimuthDegrees,
    stats: { areaMeters2: x.stats?.areaMeters2, groundAreaMeters2: x.stats?.groundAreaMeters2 },
    planeHeightAtCenterMeters: x.planeHeightAtCenterMeters, center: x.center,
  }));
  return json({
    address, lat, lng,
    groundElevationM: typeof elev?.results?.[0]?.elevation === 'number' ? elev.results[0].elevation : undefined,
    image: photo,
    insights: {
      center: s.center, imageryDate: s.imageryDate, imageryQuality: s.imageryQuality,
      solarPotential: { roofSegmentStats: segs, wholeRoofStats: s.solarPotential?.wholeRoofStats },
    },
  });
});
