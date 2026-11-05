// Online signing: the contractor sends a link; the client reads the quote (or change order) and signs on their own phone.
import { acceptedBlock, type Signature } from '@/engine/contract';
import { dateFmt } from '@/engine/format';
import type { Profile } from '@/engine/types';

import { supabase } from './client';
import { CLOUD } from './config';

export interface SignedRequest {
  id: string;
  kind: 'quote' | 'change';
  estimate_id: string;
  change_id: string | null;
  html: string;
  total: number;
  signature: { name: string; strokes: number[][]; w: number; h: number; signedAt: string; ip?: string; userAgent?: string; docSha256?: string; electronicConsent?: boolean };
}

/** Makes a signing link for a document. Older open links for the same document stop working. */
export async function createSignLink(input: {
  uid: string; kind: 'quote' | 'change'; estimateId: string; changeId?: string; title: string; company: string; clientName: string; total: number; html: string;
}): Promise<string> {
  let cancel = supabase.from('sign_requests').update({ status: 'cancelled' }).eq('owner', input.uid).eq('estimate_id', input.estimateId).eq('kind', input.kind).eq('status', 'pending');
  cancel = input.changeId ? cancel.eq('change_id', input.changeId) : cancel;
  await cancel;
  const { data, error } = await supabase.from('sign_requests').insert({
    owner: input.uid, kind: input.kind, estimate_id: input.estimateId, change_id: input.changeId ?? null,
    title: input.title, company: input.company, client_name: input.clientName, total: input.total, html: input.html,
  }).select('token').single();
  if (error || !data) throw new Error(error?.message ?? 'Could not make the link.');
  return `${CLOUD.signPage}?t=${data.token as string}`;
}

/** Documents clients signed online that the app hasn't recorded yet. */
export async function fetchNewSignatures(uid: string): Promise<SignedRequest[]> {
  const { data, error } = await supabase.from('sign_requests')
    .select('id, kind, estimate_id, change_id, html, total, signature')
    .eq('owner', uid).eq('status', 'signed').eq('applied', false).limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as SignedRequest[];
}

export async function markApplied(id: string) {
  await supabase.from('sign_requests').update({ applied: true }).eq('id', id);
}

/** The app's signature record, with the online audit trail. */
export function toSignature(r: SignedRequest): Signature {
  const s = r.signature;
  return {
    name: s.name, strokes: s.strokes, w: Number(s.w), h: Number(s.h), signedAt: s.signedAt,
    audit: { via: 'online', ip: s.ip ?? '', userAgent: s.userAgent ?? '', docSha256: s.docSha256 ?? '', electronicConsent: s.electronicConsent === true },
  };
}

/** The exact document the client saw, with their signature and the audit lines added at the end. */
export function signedHtml(r: SignedRequest, sig: Signature, profile: Profile): string {
  const audit = `<div style="margin-top:16px;font-size:11px;color:#5B6168">Signed electronically on ${dateFmt(sig.signedAt)} (${new Date(sig.signedAt).toISOString()}) by ${escapeHtml(sig.name)}, who agreed to sign electronically.
IP ${escapeHtml(sig.audit?.ip ?? '')} · ${escapeHtml((sig.audit?.userAgent ?? '').slice(0, 120))} · Document SHA-256 ${escapeHtml(sig.audit?.docSha256 ?? '')}</div>`;
  const block = `<h2>Signed online</h2>${acceptedBlock({ ...sig, total: Number(r.total) }, profile, 'en')}${audit}`;
  return r.html.includes('</body>') ? r.html.replace('</body>', `${block}</body>`) : r.html + block;
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
