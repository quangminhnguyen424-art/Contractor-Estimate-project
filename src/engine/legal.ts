// What every user agrees to before using the app. DRAFT: have a Washington attorney review before opening to the public.
// Bump TERMS_VERSION whenever the text changes in a way users must agree to again; the app then asks again.

export const TERMS_VERSION = '2026-11-05';
export const PUBLISHER = 'Quang Minh Nguyen (the developer of Bidwell AI)';
export const SUPPORT_EMAIL = 'justin.ngminh@gmail.com';

export interface ConsentItem {
  id: 'adult' | 'ai-wrong' | 'ai-share' | 'my-duty' | 'terms';
  required: boolean;
  en: string;
  vi: string;
}

/** The boxes on the welcome screen. All but "ai-share" must be ticked to continue; AI sharing can be turned on later. */
export const CONSENT_ITEMS: ConsentItem[] = [
  {
    id: 'adult', required: true,
    en: 'I am 18 or older and I use Bidwell AI for my business.',
    vi: 'Tôi đủ 18 tuổi và dùng Bidwell AI cho công việc kinh doanh.',
  },
  {
    id: 'ai-wrong', required: true,
    en: 'AI can be wrong. I will check every quantity, price, scope, permit and code item myself before anything goes to a client.',
    vi: 'AI có thể sai. Tôi sẽ tự kiểm tra mọi số lượng, giá, phạm vi, giấy phép và quy chuẩn trước khi gửi cho khách.',
  },
  {
    id: 'my-duty', required: true,
    en: 'I am responsible for my contracts, licenses, required notices in my state, taxes, and for having my clients’ permission before sending them automatic messages.',
    vi: 'Tôi chịu trách nhiệm về hợp đồng, giấy phép, các thông báo bắt buộc ở bang của tôi, thuế, và phải có sự đồng ý của khách trước khi gửi tin nhắn tự động.',
  },
  {
    id: 'terms', required: true,
    en: 'I have read and agree to the Terms of Use and the Privacy Policy.',
    vi: 'Tôi đã đọc và đồng ý với Điều khoản sử dụng và Chính sách quyền riêng tư.',
  },
  {
    id: 'ai-share', required: false,
    en: 'Use AI: send the job notes, photos and voice recordings I choose to Anthropic (the maker of Claude) so Bidwell can read them and draft estimates. They are not used to train AI models. You can turn this off in Settings.',
    vi: 'Dùng AI: gửi ghi chú, ảnh và ghi âm tôi chọn cho Anthropic (công ty làm ra Claude) để Bidwell đọc và soạn báo giá. Dữ liệu không dùng để huấn luyện AI. Có thể tắt trong Cài đặt.',
  },
];

export interface TermsSection { title: string; body: string }

/** The full Terms of Use (English). Short, plain sentences on purpose. */
export const TERMS: TermsSection[] = [
  {
    title: '1. Who we are and this agreement',
    body: `Bidwell AI ("the app") is provided by ${PUBLISHER} ("we", "us"). By using the app you agree to these Terms and to the Privacy Policy. If you use the app for a company, you agree for that company. The app is in beta: features change, and it may have bugs.`,
  },
  {
    title: '2. Who may use it',
    body: 'You must be 18 or older and use the app for your business, such as contracting, remodeling or construction work. You are responsible for your account, your device and anyone you let use them.',
  },
  {
    title: '3. AI is a helper, not a professional',
    body: 'Estimates, material lists, schedules, messages, receipt readings, translations and other content made with AI can be wrong or incomplete. They are not engineering, architectural, legal, tax, accounting or financial advice. You must review and correct everything before you rely on it or share it. You, not us, decide the price, scope and terms you offer your clients.',
  },
  {
    title: '4. You run your business',
    body: 'You are the seller to your clients. You are responsible for: your contractor license, registration, bond and insurance; permits, codes and inspections; contracts and the notices your state requires (for example, in Washington the contractor disclosure statement under RCW 18.27.114, and the three-day right to cancel for sales made at a client’s home); collecting and paying sales and income taxes; paying your workers and subcontractors; and the safety of your job sites. The app may offer notice templates as a convenience; you must check they fit your situation.',
  },
  {
    title: '5. Messages to your clients, workers and subcontractors',
    body: 'Only send messages, including follow-ups, reminders and photo updates, to people who agreed to receive them. Honor every request to stop right away. In the beta, the app prepares messages and you send them from your own phone or email. When automatic sending is added, you must collect and keep each person’s consent, and the app will record it. Do not use the app for spam, harassment or anything unlawful.',
  },
  {
    title: '6. Electronic signatures',
    body: 'The app lets clients sign quotes and change orders electronically. You are responsible for giving clients a copy and any notices the law requires, and for confirming who signed when the identity matters. Keep your own copies of signed documents.',
  },
  {
    title: '7. Your data',
    body: 'You own the information you put in the app: estimates, prices, photos, client details, receipts and notes. You give us permission to store and process it only to run the app for you. Your prices and lessons stay in your account and are never used for other users. Do not upload anything you have no right to share. You can export your data or delete your account in Settings at any time.',
  },
  {
    title: '8. AI providers and other services',
    body: 'When you turn on AI, the content you choose is sent to Anthropic, PBC to process your request, under Anthropic’s commercial terms, which do not allow training on it. Cloud storage and sign-in use Supabase. Other apps you connect (for example a webhook to Zapier or Make) receive what you choose to send them and follow their own terms.',
  },
  {
    title: '9. Payments and changes',
    body: 'The beta is free. If we add paid plans, we will show the price before you pay, and payments on iPhone follow Apple’s rules. We may change or stop features. If we change these Terms in a way that matters, the app will ask you to agree again.',
  },
  {
    title: '10. No warranty',
    body: 'The app is provided "as is" and "as available", without warranties of any kind, including fitness for a particular purpose, accuracy and uninterrupted service, to the fullest extent the law allows.',
  },
  {
    title: '11. Limit of liability',
    body: 'To the fullest extent the law allows, we are not liable for lost profits, lost jobs, underbids, cost overruns, data loss, or any indirect, incidental, special or consequential damages. Our total liability for any claim is limited to the greater of what you paid us in the 12 months before the claim or US $100.',
  },
  {
    title: '12. You protect us',
    body: 'You will defend and pay for any claim against us by your clients, workers, subcontractors or anyone else that comes from your work, your contracts, your messages, your use of AI output, or your breaking these Terms or the law.',
  },
  {
    title: '13. Ending',
    body: 'You can stop using the app and delete your account at any time. We may suspend or close accounts that break these Terms or put others at risk. Sections 3, 4, 7 and 10 to 14 continue after the account ends.',
  },
  {
    title: '14. Law and contact',
    body: `These Terms are governed by the laws of the State of Washington, USA, and disputes go to the state or federal courts in King County, Washington, unless the law where you live requires otherwise. Questions: ${SUPPORT_EMAIL}.`,
  },
];

/** Short privacy summary shown in the app (the full policy is on the web page). */
export const PRIVACY_SUMMARY = [
  'We collect what you enter: company profile, estimates, prices, client names and addresses, photos (and the place a photo was taken if you allow location), receipts, notes and voice recordings you choose to have read.',
  'We use it only to run the app for you. We do not sell it or show ads.',
  'With AI turned on, the content you choose is sent to Anthropic to process each request; it is not used to train AI models.',
  'With cloud sign-in, your data and photos are stored privately in your own account (Supabase, USA). Clients only see what you send them.',
  'Delete your account in Settings and everything in the cloud is deleted.',
];

export const missingRequired = (ticked: Record<string, boolean>) => CONSENT_ITEMS.filter((c) => c.required && !ticked[c.id]).map((c) => c.id);

export interface Consent { version: string; at: string; ai: boolean }

export const consentCurrent = (c: Consent | undefined | null) => !!c && c.version === TERMS_VERSION;
