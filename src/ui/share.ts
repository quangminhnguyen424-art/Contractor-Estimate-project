import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { hostSave, inClaudeApp, safeFileName } from './host';
import { notify } from './notify';
import { htmlToPdfBlob } from './pdfExport';

/** Turns HTML into a PDF and opens the share sheet (print dialog on plain web). Returns false if the user cancelled. */
export async function sharePdf(html: string, name: string) {
  if (Platform.OS === 'web') {
    if (inClaudeApp) {
      // Inside the Claude app the print dialog is blocked: build the PDF here and hand it to the app,
      // which opens the iPhone share sheet (Mail, Messages, Files…).
      const blob = await htmlToPdfBlob(html);
      const r = await hostSave(`${safeFileName(name)}.pdf`, blob);
      if (r === 'unavailable') throw new Error('Saving files is not available here.');
      return r === 'saved';
    }
    await Print.printAsync({ html });
    return true;
  }
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: name, UTI: 'com.adobe.pdf' });
  } else {
    notify('PDF saved', uri);
  }
  return true;
}
