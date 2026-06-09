const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');

/** Permissions / services stripped so Play Console does not require FGS declaration videos. */
const FGS_PERMISSIONS = [
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_CAMERA',
  'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
  'android.permission.FOREGROUND_SERVICE_LOCATION',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION',
  'android.permission.FOREGROUND_SERVICE_MICROPHONE',
  'android.permission.FOREGROUND_SERVICE_PHONE_CALL',
  'android.permission.FOREGROUND_SERVICE_SPECIAL_USE',
];

const FGS_SERVICES = ['app.notifee.core.ForegroundService'];

function permissionName(entry) {
  return entry.$?.['android:name'] ?? '';
}

function serviceName(entry) {
  return entry.$?.['android:name'] ?? '';
}

function ensureRemovePermission(manifest, name) {
  const list = manifest['uses-permission'] ?? [];
  const entries = Array.isArray(list) ? list : [list];
  const hasRemove = entries.some(
    (p) => permissionName(p) === name && p.$?.['tools:node'] === 'remove',
  );
  if (hasRemove) return;
  entries.push({
    $: {
      'android:name': name,
      'tools:node': 'remove',
    },
  });
  manifest['uses-permission'] = entries;
}

function ensureRemoveService(app, name) {
  const list = app.service ?? [];
  const entries = Array.isArray(list) ? list : list ? [list] : [];
  const hasRemove = entries.some(
    (s) => serviceName(s) === name && s.$?.['tools:node'] === 'remove',
  );
  if (hasRemove) return;
  entries.push({
    $: {
      'android:name': name,
      'tools:node': 'remove',
    },
  });
  app.service = entries.length ? entries : undefined;
}

/**
 * Drop foreground-service permissions and Notifee FGS from the merged manifest.
 * Live rooms still work in the foreground; background mic/audio may pause on Android.
 */
function withStripForegroundServices(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    AndroidConfig.Manifest.ensureToolsAvailable(manifest);

    const perms = manifest['uses-permission'];
    if (perms) {
      const entries = Array.isArray(perms) ? perms : [perms];
      manifest['uses-permission'] = entries.filter((p) => {
        const name = permissionName(p);
        if (p.$?.['tools:node'] === 'remove') return true;
        return !FGS_PERMISSIONS.includes(name);
      });
    }

    for (const name of FGS_PERMISSIONS) {
      ensureRemovePermission(manifest, name);
    }

    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    if (app.service) {
      const services = Array.isArray(app.service) ? app.service : [app.service];
      app.service = services.filter((s) => {
        const name = serviceName(s);
        if (s.$?.['tools:node'] === 'remove') return true;
        return !FGS_SERVICES.includes(name);
      });
      if (Array.isArray(app.service) && app.service.length === 0) {
        delete app.service;
      }
    }

    for (const name of FGS_SERVICES) {
      ensureRemoveService(app, name);
    }

    return config;
  });
}

module.exports = withStripForegroundServices;
