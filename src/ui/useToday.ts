import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { localDay } from '@/engine/site';

/** Today's date (YYYY-MM-DD), kept current: it rolls over at midnight and when the app comes back to the front. */
export function useToday(): string {
  const [today, setToday] = useState(localDay);
  useEffect(() => {
    const check = () => setToday((cur) => (cur === localDay() ? cur : localDay()));
    const t = setInterval(check, 60000);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(); });
    return () => { clearInterval(t); sub.remove(); };
  }, []);
  return today;
}
