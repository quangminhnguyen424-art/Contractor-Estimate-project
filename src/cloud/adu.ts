// The contractor's ADU check page (a public page homeowners use) and the leads it brings in.
import { supabase } from './client';
import { CLOUD } from './config';

export interface AduPage {
  code: string;
  active: boolean;
  company: string;
  phone: string;
  email: string;
  logo: string | null;
  lang: 'en' | 'vi';
  price_low: number | null;
  price_high: number | null;
  show_prices: boolean;
}

export interface AduLead {
  id: string;
  created_at: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  pin: string;
  city: string;
  zoning: string;
  lot_sqft: number | null;
  verdict: string;
  size_sf: number | null;
  message: string;
  lang: string;
  seen: boolean;
}

export const aduLink = (code: string) => `${CLOUD.aduPage}?c=${encodeURIComponent(code)}`;

/** The contractor's page, or null when they have not made one yet. */
export async function getAduPage(uid: string): Promise<AduPage | null> {
  const { data, error } = await supabase.from('adu_pages')
    .select('code, active, company, phone, email, logo, lang, price_low, price_high, show_prices').eq('owner', uid).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as AduPage | null) ?? null;
}

/** Makes or updates the page. The code (the link) is made once and never changes. */
export async function saveAduPage(uid: string, page: Omit<AduPage, 'code'>): Promise<AduPage> {
  const row = {
    owner: uid, active: page.active, company: page.company.slice(0, 120), phone: page.phone.slice(0, 40), email: page.email.slice(0, 120),
    logo: page.logo && page.logo.length <= 60000 ? page.logo : null, lang: page.lang,
    price_low: page.price_low, price_high: page.price_high, show_prices: page.show_prices, updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('adu_pages').upsert(row, { onConflict: 'owner' })
    .select('code, active, company, phone, email, logo, lang, price_low, price_high, show_prices').single();
  if (error || !data) throw new Error(error?.message ?? 'Could not save the page.');
  return data as AduPage;
}

export async function fetchAduLeads(uid: string): Promise<AduLead[]> {
  const { data, error } = await supabase.from('adu_leads')
    .select('id, created_at, name, phone, email, address, pin, city, zoning, lot_sqft, verdict, size_sf, message, lang, seen')
    .eq('owner', uid).order('created_at', { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  return (data as AduLead[]) ?? [];
}

export async function markAduLeadsSeen(uid: string, ids: string[]) {
  if (!ids.length) return;
  await supabase.from('adu_leads').update({ seen: true }).eq('owner', uid).in('id', ids);
}

export async function deleteAduLead(uid: string, id: string) {
  const { error } = await supabase.from('adu_leads').delete().eq('owner', uid).eq('id', id);
  if (error) throw new Error(error.message);
}
