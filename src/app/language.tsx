import { router } from 'expo-router';

import { LanguageScreen } from '@/ui/LanguageScreen';

/** Me → Language: change the app's language. */
export default function Language() {
  return <LanguageScreen onDone={() => router.back()} />;
}
