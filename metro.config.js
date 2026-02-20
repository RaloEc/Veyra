const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// config.resolver.unstable_enablePackageExports = true;
config.resolver.sourceExts.push('mjs', 'cjs');

// Forzamos a Metro a preferir campos que suelen ser más compatibles con React Native
config.resolver.resolverMainFields = ['react-native', 'browser', 'main'];

module.exports = config;
