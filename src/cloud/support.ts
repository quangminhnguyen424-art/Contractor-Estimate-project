import { photoBytes } from '@/ui/photoStore';

import { supabase } from './client';

export type TicketKind = 'bug' | 'question' | 'billing' | 'idea' | 'other';

/** Sends a problem report to Bidwell support (and the optional screenshot to the private photo store). */
export async function sendTicket(t: { uid: string; email?: string | null; kind: TicketKind; message: string; device: string; screenshotUri?: string | null }) {
  let screenshot: string | null = null;
  if (t.screenshotUri) {
    const bytes = await photoBytes(t.screenshotUri).catch(() => null);
    if (bytes) {
      const path = `${t.uid}/support-${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('photos').upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
      if (!error) screenshot = path;
    }
  }
  const { error } = await supabase.from('support_tickets').insert({
    user_id: t.uid, email: t.email ?? null, kind: t.kind, message: t.message.trim().slice(0, 4000), device: t.device.slice(0, 300), screenshot,
  });
  if (error) throw new Error(error.message);
}
