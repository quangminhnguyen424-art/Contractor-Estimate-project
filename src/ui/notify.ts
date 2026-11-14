import { Alert, Platform } from 'react-native';

import { tr } from '@/i18n';

/** Show a message on phone and web (React Native's Alert does nothing in a browser). */
export function notify(titleEn: string, messageEn?: string) {
  const title = tr(titleEn);
  const message = messageEn ? tr(messageEn) : undefined;
  if (Platform.OS === 'web') {
    try {
      window.alert(message ? `${title}\n\n${message}` : title);
    } catch {
      // Some embedded browsers block alerts; nothing else to do.
    }
    return;
  }
  Alert.alert(title, message);
}

/** Ask before doing something that can't be undone. */
export function confirmAction(titleEn: string, messageEn: string, actionEn: string, onConfirm: () => void) {
  const title = tr(titleEn);
  const message = tr(messageEn);
  const actionLabel = tr(actionEn);
  if (Platform.OS === 'web') {
    let ok = false;
    try {
      ok = window.confirm(`${title}\n\n${message}`);
    } catch {
      ok = false;
    }
    if (ok) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: tr('Cancel'), style: 'cancel' },
    { text: actionLabel, style: 'destructive', onPress: onConfirm },
  ]);
}
