/**
 * Utilidades puras de codificación y decodificación Base64 seguras para UTF-8.
 * Totalmente compatibles con React Native Hermes, JSC, Android, iOS y Web.
 * No depende de APIs de navegador globales como btoa/atob que fallan en Hermes.
 */

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function utf8ToBytes(str: string): number[] {
    const encoded = encodeURIComponent(str);
    const bytes: number[] = [];
    for (let i = 0; i < encoded.length; i++) {
        const c = encoded.charAt(i);
        if (c === '%') {
            bytes.push(parseInt(encoded.substr(i + 1, 2), 16));
            i += 2;
        } else {
            bytes.push(c.charCodeAt(0));
        }
    }
    return bytes;
}

function bytesToUtf8(bytes: Uint8Array | number[]): string {
    let encoded = '';
    for (let i = 0; i < bytes.length; i++) {
        const hex = bytes[i].toString(16);
        encoded += '%' + (hex.length === 1 ? '0' + hex : hex);
    }
    try {
        return decodeURIComponent(encoded);
    } catch {
        return unescape(encoded);
    }
}

/**
 * Codifica cualquier string (incluyendo caracteres Unicode y emojis) a Base64 estándar.
 */
export function encodeBase64(input: string): string {
    if (!input) return '';
    const bytes = utf8ToBytes(input);
    let output = '';
    let i = 0;

    while (i < bytes.length) {
        const b1 = bytes[i++];
        const b2 = i < bytes.length ? bytes[i++] : NaN;
        const b3 = i < bytes.length ? bytes[i++] : NaN;

        const enc1 = b1 >> 2;
        const enc2 = ((b1 & 3) << 4) | (isNaN(b2) ? 0 : b2 >> 4);
        const enc3 = isNaN(b2) ? 64 : (((b2 & 15) << 2) | (isNaN(b3) ? 0 : b3 >> 6));
        const enc4 = isNaN(b3) ? 64 : (b3 & 63);

        output +=
            BASE64_CHARS.charAt(enc1) +
            BASE64_CHARS.charAt(enc2) +
            (enc3 === 64 ? '=' : BASE64_CHARS.charAt(enc3)) +
            (enc4 === 64 ? '=' : BASE64_CHARS.charAt(enc4));
    }

    return output;
}

/**
 * Decodifica un string en Base64 a su valor UTF-8 original.
 */
export function decodeBase64(input: string): string {
    if (!input) return '';
    const clean = input.trim().replace(/[^A-Za-z0-9+/=]/g, '');
    const bytes: number[] = [];
    let i = 0;

    while (i < clean.length) {
        const enc1 = BASE64_CHARS.indexOf(clean.charAt(i++));
        const enc2 = BASE64_CHARS.indexOf(clean.charAt(i++));
        const enc3 = clean.charAt(i) === '=' ? 64 : BASE64_CHARS.indexOf(clean.charAt(i++));
        const enc4 = clean.charAt(i) === '=' ? 64 : BASE64_CHARS.indexOf(clean.charAt(i++));

        if (enc1 < 0 || enc2 < 0) break;

        const b1 = (enc1 << 2) | (enc2 >> 4);
        bytes.push(b1);

        if (enc3 !== 64 && enc3 >= 0) {
            const b2 = ((enc2 & 15) << 4) | (enc3 >> 2);
            bytes.push(b2);
        }
        if (enc4 !== 64 && enc4 >= 0) {
            const b3 = ((enc3 & 3) << 6) | enc4;
            bytes.push(b3);
        }
    }

    return bytesToUtf8(bytes);
}
