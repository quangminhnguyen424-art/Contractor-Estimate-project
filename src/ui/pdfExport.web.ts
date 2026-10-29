import html2canvas from 'html2canvas';

/**
 * Renders a quote's HTML into a real PDF in the browser (Letter size, multi-page).
 * Used where the print dialog is not available, e.g. inside the Claude app.
 * Page breaks are moved up to the nearest blank row so lines of text are never cut in half.
 */
export async function htmlToPdfBlob(html: string): Promise<Blob> {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:816px;height:1056px;border:0;visibility:hidden';
  document.body.appendChild(frame);
  try {
    const doc = frame.contentDocument!;
    doc.open();
    doc.write(html);
    doc.close();
    await new Promise((r) => setTimeout(r, 50));
    const body = doc.body;
    body.style.margin = '0';
    const canvas = await html2canvas(body, {
      scale: 2, backgroundColor: '#ffffff', windowWidth: 816, width: 816, height: body.scrollHeight, logging: false,
    });

    const pageW = 612; // US Letter in points
    const pageH = 792;
    const margin = 36;
    const usableW = pageW - margin * 2;
    const usableH = pageH - margin * 2;
    const pxPerPt = canvas.width / usableW;
    const slicePx = Math.floor(usableH * pxPerPt);
    const ctx = canvas.getContext('2d')!;

    const isBlankRow = (y: number) => {
      const row = ctx.getImageData(0, y, canvas.width, 1).data;
      for (let i = 0; i < row.length; i += 16) if (row[i] < 245 || row[i + 1] < 245 || row[i + 2] < 245) return false;
      return true;
    };

    const pages: { jpeg: Uint8Array; w: number; h: number; drawH: number }[] = [];
    let y = 0;
    while (y < canvas.height - 4) {
      let end = Math.min(y + slicePx, canvas.height);
      if (end < canvas.height) {
        // Look up to a third of a page back for a blank row to break on.
        for (let t = end; t > end - slicePx / 3; t--) {
          if (isBlankRow(t)) { end = t; break; }
        }
      }
      const h = end - y;
      const part = document.createElement('canvas');
      part.width = canvas.width;
      part.height = h;
      part.getContext('2d')!.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
      pages.push({ jpeg: dataUrlBytes(part.toDataURL('image/jpeg', 0.92)), w: canvas.width, h, drawH: h / pxPerPt });
      y = end;
    }
    return buildPdf(pages, pageW, pageH, margin, usableW);
  } finally {
    frame.remove();
  }
}

function dataUrlBytes(dataUrl: string): Uint8Array {
  const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** A small PDF writer: one JPEG image per page, placed at the top margin. */
function buildPdf(pages: { jpeg: Uint8Array; w: number; h: number; drawH: number }[], pageW: number, pageH: number, margin: number, drawW: number): Blob {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let size = 0;
  const push = (b: Uint8Array | string) => {
    const bytes = typeof b === 'string' ? enc.encode(b) : b;
    chunks.push(bytes);
    size += bytes.length;
  };
  const obj = (n: number, body: string | (() => void)) => {
    offsets[n] = size;
    push(`${n} 0 obj\n`);
    if (typeof body === 'string') push(body);
    else body();
    push('\nendobj\n');
  };

  push('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
  const pageIds = pages.map((_, i) => 3 + i * 3);
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  pages.forEach((p, i) => {
    const pageId = pageIds[i];
    const contentId = pageId + 1;
    const imageId = pageId + 2;
    const top = pageH - margin - p.drawH;
    const content = `q ${drawW.toFixed(2)} 0 0 ${p.drawH.toFixed(2)} ${margin} ${top.toFixed(2)} cm /Im0 Do Q`;
    obj(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    obj(contentId, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    obj(imageId, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
      push(p.jpeg);
      push('\nendstream');
    });
  });
  const count = 3 + pages.length * 3;
  const xref = size;
  let table = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let n = 1; n < count; n++) table += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks as BlobPart[], { type: 'application/pdf' });
}
