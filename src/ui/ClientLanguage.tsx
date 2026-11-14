import type { Estimate, Lang } from '@/engine/types';
import { currentLanguage } from '@/i18n';
import { useApp } from '@/store/AppContext';

import { Select } from './kit';

/** Until it is chosen for a job, documents go out in the contractor's own language when it is one they exist in. */
const fallback = (): Lang => (currentLanguage()?.code.startsWith('vi') ? 'vi' : 'en');

/** The language this job's quote, contract and invoices are written in: the client's, not the app's. */
export const clientLang = (est: Estimate | undefined): Lang => est?.clientLang ?? fallback();

/**
 * "Client’s language" for one job. The app itself follows the contractor's language; what the client receives
 * follows this, so a Vietnamese-speaking contractor can still send an English quote.
 */
export function ClientLanguage({ est }: { est: Estimate }) {
  const { updateEstimate } = useApp();
  return (
    <Select<Lang> label="Client’s language" value={clientLang(est)} onChange={(v) => updateEstimate(est.id, { clientLang: v })}
      options={[{ value: 'en', label: 'English' }, { value: 'vi', label: 'Tiếng Việt' }]}
      help="The quote, contract and invoices for this job are written in it." />
  );
}
