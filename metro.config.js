const { getDefaultConfig } = require('expo/metro-config');
const { wrapWithReanimatedMetroConfig } = require('react-native-reanimated/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// config.resolver.unstable_enablePackageExports = true;
config.resolver.sourceExts.push('mjs', 'cjs');

// Forzamos a Metro a preferir campos que suelen ser más compatibles con React Native
config.resolver.resolverMainFields = ['react-native', 'browser', 'main'];

// Redirigir la dependencia obsoleta isomorphic-webcrypto que lib0/Yjs intenta cargar en React Native
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (
        moduleName.startsWith('isomorphic-webcrypto') ||
        moduleName.endsWith('webcrypto.react-native.cjs') ||
        moduleName.endsWith('webcrypto.react-native')
    ) {
        return {
            filePath: path.resolve(__dirname, 'src/shims/webcrypto.js'),
            type: 'sourceFile',
        };
    }
    if (originalResolveRequest) {
        return originalResolveRequest(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
};

module.exports = wrapWithReanimatedMetroConfig(config);
