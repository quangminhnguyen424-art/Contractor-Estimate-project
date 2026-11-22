/**
 * Who makes Studwise AI and how to reach us: the one place every screen, document, email and public page reads.
 *
 * The app is owned and sold by YM LLC (a Washington limited liability company) under the trade name Studwise AI.
 * The business addresses below go live when `LIVE` is true: set it only after the domain is bought and each
 * address receives mail (see the launch plan). Until then everything points to the current inbox and phone.
 */

/** Flip to true once studwise.ai is registered and support@, privacy@ and legal@ receive mail. */
export const LIVE = true;

/**
 * The one inbox behind every address. support@, privacy@, legal@ and billing@studwise.ai are aliases that deliver
 * here; until studwise.ai is set up, the app shows this address itself.
 */
export const INBOX = 'dream@upgradeshome.com';

const NEW = {
  domain: 'studwise.ai',
  site: 'https://studwise.ai',
  support: 'support@studwise.ai',
  privacy: 'privacy@studwise.ai',
  legal: 'legal@studwise.ai',
  billing: 'billing@studwise.ai',
  /** The business line (a separate number, not a personal cell). Empty until the number is set up. */
  phone: '',
  /** Mailing address for legal notices and the footer of marketing emails (CAN-SPAM). A mailbox service is fine. */
  mail: '',
};

const NOW = {
  domain: 'quangminhnguyen424-art.github.io',
  site: 'https://quangminhnguyen424-art.github.io/Contractor-Estimate-project',
  support: INBOX,
  privacy: INBOX,
  legal: INBOX,
  billing: INBOX,
  phone: '',
  mail: '',
};

const C = LIVE ? NEW : NOW;

export const COMPANY = {
  /** The legal seller: what App Store, Google Play, invoices and the Terms name. */
  legalName: 'YM LLC',
  /** The product and trade name (registered as a trade name of YM LLC in Washington). */
  brand: 'Studwise AI',
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

/** "YM LLC, Federal Way, Washington (the developer of Studwise AI)". */
export const PUBLISHER_LINE = `${COMPANY.legalName}, ${COMPANY.city} (the developer of ${COMPANY.brand})`;
