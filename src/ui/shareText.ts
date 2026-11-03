import { Platform, Share } from 'react-native';

import { notify } from './notify';

/** Sends text through the phone's share sheet (Messages, WhatsApp, Facebook…), or copies it in a browser. */
export async function shareText(text: string, title?: string) {
  if (Platform.OS !== 'web') {
    try {
      await Share.share({ message: text, title });
    } catch {
      notify('Could not open sharing', 'Select the text and copy it instead.');
    }
    return;
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.share) {
      await navigator.share({ text, title });
      return;
    }
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(text);
    notify('Copied', 'Paste it into your message or post.');
  } catch {
    notify('Copy the text', 'Select the text in the box and copy it.');
  }
}
