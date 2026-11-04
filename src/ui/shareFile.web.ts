import { hostSave, inClaudeApp, safeFileName } from './host';

const fileName = (name: string) => {
  const ext = /\.[a-z0-9]{1,5}$/i.exec(name)?.[0] ?? '';
  return `${safeFileName(name.slice(0, name.length - ext.length)).slice(0, 60)}${ext}`;
};

/** In the browser: hand the file to the Claude app to save, or download it. */
export async function shareTextFile(name: string, text: string, mimeType: string): Promise<boolean> {
  const blob = new Blob([text], { type: mimeType });
  if (inClaudeApp) return (await hostSave(fileName(name), blob)) === 'saved';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName(name);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return true;
}
