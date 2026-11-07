import { measureRoof, type RoofMeasure, type SolarInsights } from '@/engine/roof';

import { callFunction } from './client';

interface RoofReply {
  address: string; lat: number; lng: number; groundElevationM?: number; image?: string | null; insights: SolarInsights;
}

/** Measures the roof at an address from satellite data (through Bidwell cloud). */
export async function measureAddress(address: string): Promise<{ roof: RoofMeasure; image?: string | null }> {
  const r = await callFunction<RoofReply>('roof', { address });
  const roof = measureRoof(r.insights, { address: r.address, lat: r.lat, lng: r.lng, groundElevationM: r.groundElevationM });
  if (!roof) throw new Error('No roof planes were found at this address. Enter the measurements by hand.');
  return { roof, image: r.image };
}
