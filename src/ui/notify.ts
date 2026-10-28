import { Alert, Platform } from 'react-native';

/** Show a message on phone and web (React Native's Alert does nothing in a browser). */
export function notify(title: string, message?: string) {
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
export function confirmAction(title: string, message: string, actionLabel: string, onConfirm: () => void) {
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
    { text: 'Cancel', style: 'cancel' },
    { text: actionLabel, style: 'destructive', onPress: onConfirm },
  ]);
}
