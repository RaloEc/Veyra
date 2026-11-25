const {
  withAndroidManifest,
  withAppBuildGradle,
} = require('@expo/config-plugins');

const RELEASE_SIGNING_BLOCK = `
        release {
            def keystoreFile = findProperty('VEYRA_UPLOAD_STORE_FILE') ?: System.getenv('VEYRA_UPLOAD_STORE_FILE')
            if (keystoreFile) {
                storeFile file(keystoreFile)
                storePassword findProperty('VEYRA_UPLOAD_STORE_PASSWORD') ?: System.getenv('VEYRA_UPLOAD_STORE_PASSWORD')
                keyAlias findProperty('VEYRA_UPLOAD_KEY_ALIAS') ?: System.getenv('VEYRA_UPLOAD_KEY_ALIAS')
                keyPassword findProperty('VEYRA_UPLOAD_KEY_PASSWORD') ?: System.getenv('VEYRA_UPLOAD_KEY_PASSWORD')
            }
        }`;

function applyManifestSecurity(androidManifest) {
  const applications = androidManifest?.manifest?.application;
  if (Array.isArray(applications) && applications.length > 0) {
    applications[0].$ = applications[0].$ || {};
    applications[0].$['android:allowBackup'] = 'false';
    applications[0].$['android:usesCleartextTraffic'] = 'false';
  }
  return androidManifest;
}

function extractBlock(contents, blockName) {
  const startMatch = new RegExp(`\\b${blockName}\\s*\\{`).exec(contents);
  if (!startMatch) return null;
  let depth = 0;
  let started = false;
  for (let i = startMatch.index; i < contents.length; i++) {
    if (contents[i] === '{') {
      depth++;
      started = true;
    } else if (contents[i] === '}') {
      depth--;
      if (started && depth === 0) {
        return { start: startMatch.index, end: i + 1, text: contents.slice(startMatch.index, i + 1) };
      }
    }
  }
  return null;
}

function applyBuildGradleSecurity(contents) {
  let out = contents;

  // 1. Inject signingConfigs.release if not already present inside signingConfigs { ... }
  const signingBlock = extractBlock(out, 'signingConfigs');
  if (signingBlock && !/\brelease\s*\{/.test(signingBlock.text)) {
    const updatedBlock = signingBlock.text.replace(/\}$/, `${RELEASE_SIGNING_BLOCK}\n    }`);
    out = out.slice(0, signingBlock.start) + updatedBlock + out.slice(signingBlock.end);
  }

  // 2. Point buildTypes.release to signingConfigs.release instead of signingConfigs.debug
  const buildTypesBlock = extractBlock(out, 'buildTypes');
  if (buildTypesBlock) {
    const updatedBuildTypes = buildTypesBlock.text.replace(
      /(release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/,
      '$1signingConfig signingConfigs.release'
    );
    out = out.slice(0, buildTypesBlock.start) + updatedBuildTypes + out.slice(buildTypesBlock.end);
  }

  // 3. Enable shrinkResources default in release builds
  out = out.replace(
    /findProperty\('android\.enableShrinkResourcesInReleaseBuilds'\)\s*\?:\s*'false'/,
    "findProperty('android.enableShrinkResourcesInReleaseBuilds') ?: 'true'"
  );

  return out;
}

function withAndroidSecurity(config) {
  config = withAndroidManifest(config, (cfg) => {
    cfg.modResults = applyManifestSecurity(cfg.modResults);
    return cfg;
  });

  config = withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language === 'groovy') {
      cfg.modResults.contents = applyBuildGradleSecurity(cfg.modResults.contents);
    }
    return cfg;
  });

  return config;
}

module.exports = withAndroidSecurity;
module.exports.applyManifestSecurity = applyManifestSecurity;
module.exports.applyBuildGradleSecurity = applyBuildGradleSecurity;
