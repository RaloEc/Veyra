// HMAC-SHA256 action token signing & verification for reminder notification action buttons.

export async function signActionToken(
  reminderId: string,
  expMs: number,
  secret: string
): Promise<string> {
  if (!reminderId || !secret || !Number.isFinite(expMs)) {
    throw new Error('Invalid arguments for signActionToken');
  }
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${reminderId}:${expMs}`)
  );
  const sigHex = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${expMs}.${sigHex}`;
}

export async function verifyActionToken(
  token: string,
  reminderId: string,
  secret: string,
  nowMs: number = Date.now()
): Promise<boolean> {
  if (!token || !reminderId || !secret) return false;

  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [expStr, sigHex] = parts;
  const expMs = Number(expStr);
  if (!Number.isFinite(expMs) || expMs < nowMs) return false;
  if (!/^[0-9a-f]+$/i.test(sigHex) || sigHex.length === 0 || sigHex.length % 2 !== 0) {
    return false;
  }

  const sigBytes = new Uint8Array(sigHex.length / 2);
  for (let i = 0; i < sigBytes.length; i++) {
    sigBytes[i] = parseInt(sigHex.slice(i * 2, i * 2 + 2), 16);
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  return crypto.subtle.verify(
    'HMAC',
    key,
    sigBytes,
    new TextEncoder().encode(`${reminderId}:${expStr}`)
  );
}
