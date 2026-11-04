/** The phone's contacts are only reachable in the installed app. */
export const contactsAvailable = false;

export async function pickClient(): Promise<{ name: string; phone: string; address: string } | null> {
  return null;
}
