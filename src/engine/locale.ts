/**
 * The locale for dates the contractor reads ("Fri, Nov 13" / "Th 6, 13 thg 11"). Set from the app's language.
 * Money always stays in US format ($1,234.00), and client documents use the client's language instead.
 */
let tag = 'en-US';
export const dateLocale = (): string => tag;
export function setDateLocale(next: string | undefined) {
  // A tag the phone does not know would throw in toLocaleDateString; fall back to English for those.
  try { new Date().toLocaleDateString(next ?? 'en-US'); tag = next ?? 'en-US'; } catch { tag = 'en-US'; }
}
