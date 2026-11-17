import { COMPANY } from '@/engine/company';

// Bidwell cloud (Supabase). The anon key is public by design: every table is locked to its owner by row-level security.
export const CLOUD = {
  url: 'https://eiknmhqiemtdgslwctxn.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpa25taHFpZW10ZGdzbHdjdHhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4NDA0OTgsImV4cCI6MjEwOTQxNjQ5OH0._cY2yizzjpxe2HnzG04b2zVzfyj-_Y-rOAedGChjUY0',
  /** The page clients open to sign (served free from GitHub Pages). */
  signPage: `${COMPANY.site}/sign.html`,
  /** The homeowner's "Can I build an ADU?" page; each contractor's own link adds ?c=<their code>. */
  aduPage: `${COMPANY.site}/adu.html`,
  /** Where the "reset your password" email takes the contractor to choose a new password. */
  resetPage: `${COMPANY.site}/reset.html`,
};

export const cloudConfigured = !!CLOUD.url && !!CLOUD.anonKey;
