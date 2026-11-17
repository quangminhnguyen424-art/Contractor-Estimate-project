/**
 * Who makes Bidwell AI and how to reach us: the one place every screen, document, email and public page reads.
 *
 * The app is owned and sold by YM LLC (a Washington limited liability company) under the trade name Bidwell AI.
 * The business addresses below go live when `LIVE` is true: set it only after the domain is bought and each
 * address receives mail (see the launch plan). Until then everything points to the current inbox and phone.
 */

/** Flip to true once getbidwellai.com is registered and support@, privacy@ and legal@ receive mail. */
export const LIVE = false;

const NEW = {
  domain: 'getbidwellai.com',
  site: 'https://getbidwellai.com',
  support: 'support@getbidwellai.com',
  privacy: 'privacy@getbidwellai.com',
  legal: 'legal@getbidwellai.com',
  billing: 'billing@getbidwellai.com',
  /** The business line (a separate number, not a personal cell). Empty until the number is set up. */
  phone: '',
  /** Mailing address for legal notices and the footer of marketing emails (CAN-SPAM). A mailbox service is fine. */
  mail: '',
};

const NOW = {
  domain: 'quangminhnguyen424-art.github.io',
  site: 'https://quangminhnguyen424-art.github.io/Contractor-Estimate-project',
  support: 'justin.ngminh@gmail.com',
  privacy: 'justin.ngminh@gmail.com',
  legal: 'justin.ngminh@gmail.com',
  billing: 'justin.ngminh@gmail.com',
  phone: '',
  mail: '',
};

const C = LIVE ? NEW : NOW;

export const COMPANY = {
  /** The legal seller: what App Store, Google Play, invoices and the Terms name. */
  legalName: 'YM LLC',
  /** The product and trade name (registered as a trade name of YM LLC in Washington). */
  brand: 'Bidwell AI',
  state: 'Washington',
  city: 'Federal Way, Washington',
  ...C,
  /** Public pages. Every path is served next to the client signing page. */
  pages: {
    privacy: `${C.site}/privacy.html`,
    terms: `${C.site}/terms.html`,
    support: `${C.site}/support.html`,
    deleteAccount: `${C.site}/delete-account.html`,
    help: `${C.site}/help.html`,
  },
};

/** "YM LLC, Federal Way, Washington (the developer of Bidwell AI)". */
export const PUBLISHER_LINE = `${COMPANY.legalName}, ${COMPANY.city} (the developer of ${COMPANY.brand})`;
