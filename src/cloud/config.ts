// Bidwell cloud (Supabase). The anon key is public by design: every table is locked to its owner by row-level security.
export const CLOUD = {
  url: 'https://eiknmhqiemtdgslwctxn.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpa25taHFpZW10ZGdzbHdjdHhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4NDA0OTgsImV4cCI6MjEwOTQxNjQ5OH0._cY2yizzjpxe2HnzG04b2zVzfyj-_Y-rOAedGChjUY0',
  /** The page clients open to sign (served free from GitHub Pages). */
  signPage: 'https://quangminhnguyen424-art.github.io/Contractor-Estimate-project/sign.html',
  /** Where the "reset your password" email takes the contractor to choose a new password. */
  resetPage: 'https://quangminhnguyen424-art.github.io/Contractor-Estimate-project/reset.html',
};

export const cloudConfigured = !!CLOUD.url && !!CLOUD.anonKey;
