// Pure WebCrypto implementation of RFC 8291 (aes128gcm) + VAPID ES256 JWT (RFC 8292).
// Runs natively in Supabase Edge Runtime (Deno) and Node 24+ with zero Node polyfills.

export interface PushSubscriptionKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface VapidConfig {
  subject: string;
  publicKey: string;
  privateKey: string;
}

export interface SendPushOptions {
  ttl?: number;
  urgency?: 'very-low' | 'low' | 'normal' | 'high';
  topic?: string;
}

export interface SendPushResult {
  ok: boolean;
  status: number;
  expired: boolean;
  error?: string;
}

export function base64UrlToUint8Array(input: string): Uint8Array {
  const trimmed = input.trim();
  const padding = '='.repeat((4 - (trimmed.length % 4)) % 4);
  const base64 = (trimmed + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    out[i] = raw.charCodeAt(i);
  }
  return out;
}

export function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function concatUint8Arrays(...arrays: Uint8Array[]): Uint8Array {
  const totalLen = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(totalLen);
  let offset = 0;
  for (const arr of arrays) {
    out.set(arr, offset);
    offset += arr.length;
  }
  return out;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function hkdfSha256(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  lengthBytes: number
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(ikm),
    'HKDF',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: toArrayBuffer(salt),
      info: toArrayBuffer(info),
    },
    key,
    lengthBytes * 8
  );
  return new Uint8Array(bits);
}

/**
 * Generates an ES256 VAPID JWT (RFC 8292) for the target push endpoint origin.
 */
export async function createVapidJwt(
  endpoint: string,
  subject: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  ttlSeconds = 12 * 3600
): Promise<string> {
  const aud = new URL(endpoint).origin;
  const nowSec = Math.floor(Date.now() / 1000);
  const clampedTtl = Math.max(60, Math.min(24 * 3600, Math.floor(ttlSeconds)));
  const exp = nowSec + clampedTtl;

  const pubBytes = base64UrlToUint8Array(vapidPublicKey);
  if (pubBytes.length !== 65 || pubBytes[0] !== 0x04) {
    throw new Error('Invalid VAPID public key format (expected 65-byte uncompressed P-256 point)');
  }
  const privBytes = base64UrlToUint8Array(vapidPrivateKey);
  if (privBytes.length !== 32) {
    throw new Error('Invalid VAPID private key format (expected 32-byte P-256 scalar)');
  }

  const x = uint8ArrayToBase64Url(pubBytes.subarray(1, 33));
  const y = uint8ArrayToBase64Url(pubBytes.subarray(33, 65));
  const d = uint8ArrayToBase64Url(privBytes);

  const signingKey = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x, y, d },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const encoder = new TextEncoder();
  const headerB64 = uint8ArrayToBase64Url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payloadB64 = uint8ArrayToBase64Url(encoder.encode(JSON.stringify({ aud, exp, sub: subject })));
  const unsigned = `${headerB64}.${payloadB64}`;

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    signingKey,
    toArrayBuffer(encoder.encode(unsigned))
  );

  const sigB64 = uint8ArrayToBase64Url(new Uint8Array(signature));
  return `${unsigned}.${sigB64}`;
}

/**
 * Encrypts a push payload according to RFC 8291 / RFC 8188 (Content-Encoding: aes128gcm).
 */
export async function encryptPushPayload(
  p256dh: string,
  auth: string,
  payload: string | Uint8Array
): Promise<Uint8Array> {
  const uaPublicBytes = base64UrlToUint8Array(p256dh);
  if (uaPublicBytes.length !== 65 || uaPublicBytes[0] !== 0x04) {
    throw new Error('Invalid client p256dh public key');
  }
  const authSecret = base64UrlToUint8Array(auth);
  if (authSecret.length !== 16) {
    throw new Error('Invalid client auth secret');
  }

  const uaPublicKey = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(uaPublicBytes),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  const asKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );

  const asPublicBytes = new Uint8Array(await crypto.subtle.exportKey('raw', asKeyPair.publicKey));
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: uaPublicKey },
      asKeyPair.privateKey,
      256
    )
  );

  const encoder = new TextEncoder();
  const keyInfo = concatUint8Arrays(
    encoder.encode('WebPush: info\0'),
    uaPublicBytes,
    asPublicBytes
  );
  const ikm = await hkdfSha256(authSecret, ecdhSecret, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdfSha256(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdfSha256(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12);

  const plaintextBytes = typeof payload === 'string' ? encoder.encode(payload) : payload;
  // RFC 8188 single-record delimiter 0x02 followed by zero padding bytes
  const paddedPlaintext = concatUint8Arrays(plaintextBytes, new Uint8Array([0x02]));

  const aesKey = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(cek),
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(nonce), tagLength: 128 },
      aesKey,
      toArrayBuffer(paddedPlaintext)
    )
  );

  // RFC 8188 header: salt(16) || rs(uint32BE=4096) || idlen(uint8=65) || keyid(asPublicBytes)
  const header = new Uint8Array(16 + 4 + 1 + asPublicBytes.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096, false);
  header[20] = asPublicBytes.length;
  header.set(asPublicBytes, 21);

  return concatUint8Arrays(header, ciphertext);
}

/**
 * Encrypts and sends a Web Push notification using VAPID authentication.
 */
export async function sendWebPushNotification(
  sub: PushSubscriptionKeys,
  payload: string,
  vapid: VapidConfig,
  options: SendPushOptions = {}
): Promise<SendPushResult> {
  try {
    const jwt = await createVapidJwt(
      sub.endpoint,
      vapid.subject,
      vapid.publicKey,
      vapid.privateKey,
      12 * 3600
    );
    const bodyBytes = await encryptPushPayload(sub.p256dh, sub.auth, payload);
    const vapidKeyB64Url = uint8ArrayToBase64Url(base64UrlToUint8Array(vapid.publicKey));

    const headers: Record<string, string> = {
      'Authorization': `vapid t=${jwt}, k=${vapidKeyB64Url}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'TTL': String(options.ttl ?? 86400),
      'Urgency': options.urgency ?? 'normal',
    };

    if (options.topic) {
      headers['Topic'] = options.topic.slice(0, 32);
    }

    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers,
      body: toArrayBuffer(bodyBytes),
    });

    if (res.status >= 200 && res.status < 300) {
      return { ok: true, status: res.status, expired: false };
    }

    const errBody = await res.text().catch(() => '');
    const expired = res.status === 404 || res.status === 410;
    return {
      ok: false,
      status: res.status,
      expired,
      error: errBody || `Push service responded with HTTP ${res.status}`,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      status: 0,
      expired: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
