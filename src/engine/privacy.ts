import { COMPANY } from './company';

/**
 * The full Privacy Policy (English), published at /privacy.html and linked from the app and the store listings.
 * It describes what the app actually does; change it whenever data handling changes. DRAFT: have a Washington
 * attorney review before opening to the public.
 */
export const PRIVACY_VERSION = '2026-11-19';

export interface PolicySection { title: string; body: string[] }

export const PRIVACY_POLICY: PolicySection[] = [
  {
    title: '1. Who we are',
    body: [
      `${COMPANY.brand} is an app for contractors, made and run by ${COMPANY.legalName}, a ${COMPANY.state} limited liability company ("we", "us"). This policy covers the ${COMPANY.brand} app for iPhone, Android and the web, and the web pages it uses: the client signing page, the ADU check page, the help center and the account pages.`,
      `Questions or requests about your information: ${COMPANY.privacy}.`,
    ],
  },
  {
    title: '2. Contractors who use the app',
    body: [
      'Account: your email address and password (the password is stored only as a secure hash by our sign-in provider).',
      'What you enter: your company profile and logo, license and contact details, prices, estimates, quotes, contracts, invoices, change orders, receipts, schedules, notes, crew and subcontractor names and rates, and the names, addresses, phone numbers and emails of your clients.',
      'Photos and files you add. If you allow location, the place a job-site photo was taken is saved with it.',
      'Voice: voice typing uses your phone’s own speech service. Recordings are not stored by us unless you choose to attach one to a job.',
      'Support: what you send in a problem report, and a screenshot if you add one.',
      'Technical: the device model and app version in problem reports, and the usage counts we need to apply daily limits (for example, how many AI requests an account made today). We do not use advertising or third-party tracking tools.',
    ],
  },
  {
    title: '3. Clients who sign online',
    body: [
      'When a contractor sends you a link to review and sign a quote or change order, we store the document, your name, your signature, the time you signed, your consent to sign electronically, your internet (IP) address and browser type, and a fingerprint of the exact document. This is the signing record that proves what was agreed.',
      'If you ask for changes instead of signing, we store your name and message for the contractor.',
      'The contractor who sent the link decides how this information is used for your project. For questions about your project, contact the contractor first; you can also write to us.',
    ],
  },
  {
    title: '4. Homeowners who use an ADU check page',
    body: [
      'When you type an address, your browser looks it up in King County’s public property records (address, parcel number, zoning, lot size). We do not store the address unless you ask for the full report.',
      'If you ask for the full report, we store your name, phone, email, message, the address and what the lot check found, and give them to the contractor whose page you used, so they can contact you about your project. You agree to that contact when you send the form.',
    ],
  },
  {
    title: '5. How we use information',
    body: [
      'To run the app for you: save and sync your work, make documents, send signing links, show your leads, and answer your questions with AI.',
      'To keep the service safe and working: prevent abuse, apply limits, fix problems and answer support requests.',
      'To contact you about your account, and, only if you said yes, to send setup tips and product news. You can say no or stop at any time.',
      'We do not sell personal information, we do not share it for advertising, and we do not use your prices, estimates or lessons for any other user.',
    ],
  },
  {
    title: '6. Service providers',
    body: [
      'We use these companies to run the app. They may use your information only to provide their service to us.',
      'Supabase (United States): sign-in, database, file storage and server functions.',
      'Anthropic, PBC (United States): the AI behind Studwise. When AI is on, the job notes, photos, questions and business details needed for each request are sent to Anthropic under its commercial terms, which do not allow training AI models on them.',
      'Google: when you use Measure roof, the job address is sent to Google to find and measure the roof.',
      'King County (Washington): public property records, looked up directly by your device on the ADU check and permit screens.',
      'Website hosting and email delivery providers: to serve the public pages and to send account emails such as password resets.',
      'Stripe, Inc. (United States): payments for paid plans. Stripe receives your email, card and billing details directly; we keep only your plan, its dates and Stripe’s customer reference, never your card number.',
      'Apple and Google: app distribution.',
      'Other apps you connect yourself (for example Zapier, Make, QuickBooks or Google) receive only what you choose to send them.',
      'Team accounts: if the owner of a Team account invites you, or you invite someone, the people on that team see and change the company’s jobs, quotes, photos and schedule, and see each other’s email address. Leaving or being removed stops this right away.',
    ],
  },
  {
    title: '7. When we may disclose information',
    body: [
      'To follow the law or a valid legal order, to protect the rights, safety and property of our users, the public or us, or as part of a merger or sale of the business, in which case this policy continues to apply.',
    ],
  },
  {
    title: '8. How long we keep it',
    body: [
      'Contractor accounts: until you delete the account. Deleting the account (Me > your account > Delete my account, or the delete-account page) removes your workspace, photos, signing records, leads and support history from our systems; copies in backups are removed within 30 days.',
      'Signing records and leads belong to the contractor’s account and are deleted with it, or earlier if the contractor deletes them.',
      'Usage counts for limits: up to 90 days.',
    ],
  },
  {
    title: '9. Your choices and rights',
    body: [
      'You can see, correct and export your information in the app (Me > Backup), turn AI off (Me > Studwise AI), and delete your account at any time.',
      `Depending on where you live, you may have the right to know what we hold about you, to get a copy, to correct it, to delete it, and to opt out of sale or targeted advertising (we do neither). Write to ${COMPANY.privacy}; we answer within 45 days and will not treat you differently for asking. We may need to confirm your identity first. An authorized agent may ask for you with your written permission.`,
      'If you are a contractor’s client or a homeowner, you can also ask the contractor directly.',
    ],
  },
  {
    title: '10. Security',
    body: [
      'Information is encrypted in transit. Each account can reach only its own data; client pages see only the one document or page they were sent. No system is perfectly secure: use a strong password and keep your phone locked. If a breach affects your information, we will tell you as the law requires.',
    ],
  },
  {
    title: '11. Children',
    body: ['The app is for businesses and people 18 and older. We do not knowingly collect information from children under 13. If you believe a child gave us information, write to us and we will delete it.'],
  },
  {
    title: '12. Where information is stored',
    body: ['Our systems are in the United States. If you use the app from another country, your information is moved to and stored in the United States.'],
  },
  {
    title: '13. Changes',
    body: ['We will post any change here with a new date. If a change matters, the app will tell you before it applies.'],
  },
  {
    title: '14. Contact',
    body: [
      `Privacy: ${COMPANY.privacy}. Support: ${COMPANY.support}.${COMPANY.phone ? ` Phone: ${COMPANY.phone}.` : ''}`,
      `${COMPANY.legalName} (${COMPANY.brand})${COMPANY.mail ? `, ${COMPANY.mail}` : `, ${COMPANY.city}`}.`,
    ],
  },
];
