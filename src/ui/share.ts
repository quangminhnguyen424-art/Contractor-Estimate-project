import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Alert, Platform } from 'react-native';

/** Turns HTML into a PDF and opens the share sheet (print dialog on web). */
export async function sharePdf(html: string, name: string) {
  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return true;
  }
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: name, UTI: 'com.adobe.pdf' });
  } else {
    Alert.alert('PDF saved', uri);
  }
  return true;
}
