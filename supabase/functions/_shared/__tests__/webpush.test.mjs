import test from 'node:test';
import assert from 'node:assert/strict';
import {
  base64UrlToUint8Array,
  uint8ArrayToBase64Url,
  createVapidJwt,
  encryptPushPayload,
} from '../webpush.ts';
import {
  signActionToken,
  verifyActionToken,
} from '../actionToken.ts';

function concatBytes(...arrays) {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

async function hkdf(salt, ikm, info, len) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    len * 8
  );
  return new Uint8Array(bits);
}

// Independent RFC 8291 / RFC 8188 decryptor simulating Chrome/Firefox push decryption
async function decryptAes128GcmPush(uaKeyPair, authSecret, encryptedBody) {
  const salt = encryptedBody.subarray(0, 16);
  const rs = new DataView(encryptedBody.buffer, encryptedBody.byteOffset + 16, 4).getUint32(0, false);
  assert.equal(rs, 4096);
  const idlen = encryptedBody[20];
  assert.equal(idlen, 65);
  const asPublicBytes = encryptedBody.subarray(21, 21 + idlen);
  const ciphertext = encryptedBody.subarray(21 + idlen);

  const uaPublicBytes = new Uint8Array(await crypto.subtle.exportKey('raw', uaKeyPair.publicKey));
  const asPublicKey = await crypto.subtle.importKey(
    'raw',
    asPublicBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: asPublicKey },
      uaKeyPair.privateKey,
      256
    )
  );

  const enc = new TextEncoder();
  const keyInfo = concatBytes(enc.encode('WebPush: info\0'), uaPublicBytes, asPublicBytes);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['decrypt']);
  const decrypted = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, ciphertext)
  );

  // Strip trailing padding delimiter 0x02 (and any trailing zeros)
  let end = decrypted.length - 1;
  while (end >= 0 && decrypted[end] === 0) end--;
  assert.equal(decrypted[end], 0x02, 'Expected RFC 8188 0x02 record delimiter');
  return new TextDecoder().decode(decrypted.subarray(0, end));
}

test('createVapidJwt produces valid ES256 signature verifiable by WebCrypto', async () => {
  const ecPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );
  const pubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', ecPair.publicKey));
  const jwkPriv = await crypto.subtle.exportKey('jwk', ecPair.privateKey);
  const vapidPublicKey = uint8ArrayToBase64Url(pubRaw);
  const vapidPrivateKey = jwkPriv.d;

  const jwt = await createVapidJwt(
    'https://fcm.googleapis.com/fcm/send/sample-endpoint-id',
    'mailto:admin@veyra.app',
    vapidPublicKey,
    vapidPrivateKey,
    3600
  );

  const parts = jwt.split('.');
  assert.equal(parts.length, 3);

  const header = JSON.parse(new TextDecoder().decode(base64UrlToUint8Array(parts[0])));
  const claims = JSON.parse(new TextDecoder().decode(base64UrlToUint8Array(parts[1])));
  assert.deepEqual(header, { typ: 'JWT', alg: 'ES256' });
  assert.equal(claims.aud, 'https://fcm.googleapis.com');
  assert.equal(claims.sub, 'mailto:admin@veyra.app');
  assert.ok(claims.exp > Math.floor(Date.now() / 1000));

  const verified = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    ecPair.publicKey,
    base64UrlToUint8Array(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  );
  assert.equal(verified, true);
});

test('encryptPushPayload round-trips RFC 8291 aes128gcm with base64url and standard base64 keys', async () => {
  const uaKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
  const uaPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', uaKeyPair.publicKey));
  const authSecret = crypto.getRandomValues(new Uint8Array(16));

  const p256dhB64Url = uint8ArrayToBase64Url(uaPubRaw);
  const authB64Url = uint8ArrayToBase64Url(authSecret);

  const payloadObj = {
    title: '📅 En 15 min: Reunión diaria 🚀',
    body: 'Revisión de notificaciones con acentos y ñ',
    reminderId: 'rem-123',
    tag: 'reminder-rem-123',
  };
  const payloadJson = JSON.stringify(payloadObj);

  const encryptedUrl = await encryptPushPayload(p256dhB64Url, authB64Url, payloadJson);
  const recoveredUrl = await decryptAes128GcmPush(uaKeyPair, authSecret, encryptedUrl);
  assert.deepEqual(JSON.parse(recoveredUrl), payloadObj);

  // Standard base64 (with + / =) must also work
  const p256dhStdB64 = Buffer.from(uaPubRaw).toString('base64');
  const authStdB64 = Buffer.from(authSecret).toString('base64');
  const encryptedStd = await encryptPushPayload(p256dhStdB64, authStdB64, payloadJson);
  const recoveredStd = await decryptAes128GcmPush(uaKeyPair, authSecret, encryptedStd);
  assert.deepEqual(JSON.parse(recoveredStd), payloadObj);
});

test('actionToken verifies valid HMAC tokens and rejects legacy bypass & tampered/expired tokens', async () => {
  const secret = 'test-vapid-private-secret-scalar';
  const now = 1_795_000_000_000;
  const reminderId = 'rem-abc-123';

  const validToken = await signActionToken(reminderId, now + 60_000, secret);
  assert.equal(await verifyActionToken(validToken, reminderId, secret, now), true);

  // Wrong reminderId fails
  assert.equal(await verifyActionToken(validToken, 'other-rem', secret, now), false);

  // Expired token fails
  assert.equal(await verifyActionToken(validToken, reminderId, secret, now + 120_000), false);

  // Tampered signature fails
  const [exp, sig] = validToken.split('.');
  const flipped = (sig[0] === 'a' ? 'b' : 'a') + sig.slice(1);
  assert.equal(await verifyActionToken(`${exp}.${flipped}`, reminderId, secret, now), false);

  // Legacy prefix bypass MUST be rejected
  assert.equal(await verifyActionToken(`token-${reminderId}-anything`, reminderId, secret, now), false);
});
