import { tr } from '@/i18n';

/**
 * The payment steps every new account starts with. Listed here so the app's own screens show them in the user's
 * language; a step the contractor renamed is shown as typed.
 */
export const DEFAULT_STEPS = ['Deposit at signing', 'Rough-in complete', 'Finishes complete', 'Final walkthrough'];

/** "Deposit at signing (10%)" with the step's name in the app's language. */
export function stepLabel(label: string): string {
  const m = /^(.*) \(([\d.]+%)\)$/.exec(label);
  return m ? `${tr(m[1])} (${m[2]})` : tr(label);
}
