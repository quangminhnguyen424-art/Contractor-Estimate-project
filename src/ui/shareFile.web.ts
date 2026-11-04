import { hostSave, inClaudeApp, safeFileName } from './host';

/** In the browser: hand the file to the Claude app to save, or download it. */
export async function shareTextFile(name: string, text: string, mimeType: string): Promise<boolean> {
  const blob = new Blob([text], { type: mimeType });
  if (inClaudeApp) return (await hostSave(safeFileName(name), blob)) === 'saved';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = safeFileName(name);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return true;
}
