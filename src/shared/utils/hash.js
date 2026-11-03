const encoder = new TextEncoder();

export function bytesToHex(bytes) {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function bytesToBase64(bytes) {
  const view = new Uint8Array(bytes);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < view.length; i += chunk) {
    binary += String.fromCharCode.apply(null, view.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function digest(algorithm, bytes) {
  return crypto.subtle.digest(algorithm, bytes);
}

// SHA-256 hex of a script's source; used to detect local edits to installed scripts.
export async function hashCode(code) {
  return bytesToHex(await digest('SHA-256', encoder.encode(String(code ?? ''))));
}
