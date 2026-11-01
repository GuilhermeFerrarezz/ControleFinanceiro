/** Excel may save CSV as UTF-8, UTF-16 with a BOM, or Windows-1252. */
export function decodeCsv(bytes: ArrayBuffer): string {
  const prefix = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 2));
  if (prefix[0] === 0xff && prefix[1] === 0xfe) return new TextDecoder('utf-16le', { fatal: true }).decode(bytes);
  if (prefix[0] === 0xfe && prefix[1] === 0xff) return new TextDecoder('utf-16be', { fatal: true }).decode(bytes);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return new TextDecoder('windows-1252').decode(bytes); }
}
