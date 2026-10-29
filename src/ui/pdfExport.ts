/** Native builds make PDFs with expo-print; this web-only helper is not used there. */
export async function htmlToPdfBlob(_html: string): Promise<Blob> {
  throw new Error('htmlToPdfBlob is web-only');
}
