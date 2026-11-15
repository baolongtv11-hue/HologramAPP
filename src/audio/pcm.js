export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const blockSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += blockSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + blockSize, bytes.length)));
  }
  return btoa(binary);
}

export function sampleRateFromMimeType(mimeType, fallback = 24_000) {
  const match = String(mimeType || '').match(/rate=(\d+)/i);
  const value = match ? Number(match[1]) : NaN;
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function rmsFromPcm16Buffer(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 2) return 0;
  const view = new DataView(buffer);
  const count = Math.floor(buffer.byteLength / 2);
  let sum = 0;
  for (let i = 0; i < count; i += 1) {
    const value = view.getInt16(i * 2, true) / 32768;
    sum += value * value;
  }
  return Math.min(1, Math.sqrt(sum / count) * 4.2);
}

export function rmsFromBase64Pcm16(base64) {
  if (!base64) return 0;
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return rmsFromPcm16Buffer(buffer);
}
