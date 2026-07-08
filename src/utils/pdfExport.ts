const base64ToUint8Array = (base64: string): Uint8Array => {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const formatNumber = (value: number) => Number.isInteger(value) ? `${value}` : value.toFixed(2);

export const buildSingleImagePdfBlob = ({
  jpegDataUrl,
  width,
  height,
}: {
  jpegDataUrl: string;
  width: number;
  height: number;
}): Blob => {
  const base64 = jpegDataUrl.split(',')[1];
  if (!base64) {
    throw new Error('Invalid JPEG data URL');
  }

  const imageBytes = base64ToUint8Array(base64);
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let offset = 0;
  const offsets: number[] = [0];

  const pushText = (text: string) => {
    const encoded = encoder.encode(text);
    chunks.push(encoded);
    offset += encoded.length;
  };

  const pushBytes = (bytes: Uint8Array) => {
    chunks.push(bytes);
    offset += bytes.length;
  };

  const addObject = (objectId: number, body: string | Uint8Array, tail = '\nendobj\n') => {
    offsets[objectId] = offset;
    pushText(`${objectId} 0 obj\n`);
    if (typeof body === 'string') {
      pushText(body);
    } else {
      pushBytes(body);
    }
    pushText(tail);
  };

  const pageWidth = Math.max(1, width);
  const pageHeight = Math.max(1, height);
  const contentStream = `q\n${formatNumber(pageWidth)} 0 0 ${formatNumber(pageHeight)} 0 0 cm\n/Im0 Do\nQ`;

  pushText('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n');

  addObject(1, '<< /Type /Catalog /Pages 2 0 R >>');
  addObject(2, '<< /Type /Pages /Count 1 /Kids [3 0 R] >>');
  addObject(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${formatNumber(pageWidth)} ${formatNumber(pageHeight)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`
  );

  offsets[4] = offset;
  pushText(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${Math.max(1, Math.round(width))} /Height ${Math.max(1, Math.round(height))} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`);
  pushBytes(imageBytes);
  pushText('\nendstream\nendobj\n');

  addObject(5, `<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`);

  const xrefOffset = offset;
  pushText(`xref\n0 ${offsets.length}\n`);
  pushText('0000000000 65535 f \n');
  for (let i = 1; i < offsets.length; i += 1) {
    pushText(`${offsets[i].toString().padStart(10, '0')} 00000 n \n`);
  }
  pushText(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  return new Blob(chunks, { type: 'application/pdf' });
};
