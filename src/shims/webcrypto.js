'use strict';

/**
 * Shim de WebCrypto para React Native / Expo.
 * 
 * Este módulo reemplaza isomorphic-webcrypto en lib0 y Yjs dentro del entorno React Native.
 * Utiliza crypto.getRandomValues provisto por react-native-get-random-values y el objeto
 * globalThis.crypto si está disponible en el motor Hermes / JavaScript.
 */

const getRandomValues = (arr) => {
    if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
        return globalThis.crypto.getRandomValues(arr);
    }
    if (typeof global !== 'undefined' && global.crypto && typeof global.crypto.getRandomValues === 'function') {
        return global.crypto.getRandomValues(arr);
    }
    // Fallback de emergencia
    for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
    }
    return arr;
};

const subtle = (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) || null;

const defaultExport = {
    getRandomValues,
    subtle,
    ensureSecure: () => {},
};

module.exports = {
    getRandomValues,
    subtle,
    default: defaultExport,
    ensureSecure: () => {},
};
