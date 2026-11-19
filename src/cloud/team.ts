// Team plan: up to 3 people share one company account. The owner invites by email; the other person types the code.
import { supabase } from './client';

export interface TeamInfo {
  role: 'solo' | 'owner' | 'member';
  owner: string;
  owner_email: string | null;
  members: { member: string; email: string; joined_at: string }[];
  invites: { code: string; email: string; expires_at: string }[];
}
export const TEAM_SIZE = 3;

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message || 'Something went wrong. Try again.');
  return data as T;
}

export const getTeam = () => rpc<TeamInfo | null>('my_team');
/** Returns the 8-character code to give the person. */
export const inviteToTeam = (email: string) => rpc<string>('create_team_invite', { p_email: email });
export const joinTeam = (code: string) => rpc<string>('join_team', { p_code: code });
export const leaveTeam = () => rpc<void>('leave_team');
export const removeFromTeam = (member: string) => rpc<void>('remove_team_member', { p_member: member });
export const cancelInvite = (code: string) => rpc<void>('cancel_team_invite', { p_code: code });

/** The text the owner sends: what Studwise is, the code, and how to use it. */
export const inviteMessage = (company: string, code: string, email: string) =>
  `You're invited to ${company || 'our company'} on Studwise AI, so we work on the same jobs, quotes and schedule.\n\n` +
  `1. Install Studwise AI and create an account with ${email}\n2. Go to Me → Team accounts → Join a team\n3. Enter this code: ${code}\n\nThe code works for 7 days.`;
