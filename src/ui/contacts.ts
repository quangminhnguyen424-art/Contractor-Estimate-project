import { Contact } from 'expo-contacts';

export const contactsAvailable = true;

/** Opens the phone's contact picker. Returns the client's name, phone and address, or null if cancelled. */
export async function pickClient(): Promise<{ name: string; phone: string; address: string } | null> {
  const c = await Contact.presentPicker();
  if (!c) return null;
  const [name, phones, addresses] = await Promise.all([
    c.getFullName().catch(() => ''), c.getPhones().catch(() => []), c.getAddresses().catch(() => []),
  ]);
  const a = addresses[0];
  const address = a ? [a.street, a.city, [a.state, a.postcode].filter(Boolean).join(' ')].filter((x) => x && String(x).trim()).join(', ') : '';
  return { name: (name ?? '').trim(), phone: phones[0]?.number ?? '', address };
}
