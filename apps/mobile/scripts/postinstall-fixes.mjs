import fs from 'node:fs';
import path from 'node:path';

function listJsFilesRecursive(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listJsFilesRecursive(p));
    else if (ent.isFile() && p.endsWith('.js')) out.push(p);
  }
  return out;
}

function patchRelativeEsmSpecifiers(filePath) {
  const original = fs.readFileSync(filePath, 'utf8');

  const patchSpecifier = (spec) => {
    // Patch only relative specifiers; keep package imports intact.
    if (!(spec.startsWith('./') || spec.startsWith('../'))) return spec;
    if (/\.(js|json|node)$/.test(spec)) return spec;
    return `${spec}.js`;
  };

  const patched = original
    // export ... from '...'
    .replace(/from\s+(['"])(\.[^'"]+)\1/g, (_m, quote, spec) => `from ${quote}${patchSpecifier(spec)}${quote}`)
    // dynamic import('...')
    .replace(/import\(\s*(['"])(\.[^'"]+)\1\s*\)/g, (_m, quote, spec) => `import(${quote}${patchSpecifier(spec)}${quote})`);

  if (patched !== original) fs.writeFileSync(filePath, patched, 'utf8');
}

function patchVisionCameraLib() {
  const libDir = path.join(
    process.cwd(),
    'node_modules',
    'react-native-vision-camera',
    'lib',
  );

  for (const filePath of listJsFilesRecursive(libDir)) {
    patchRelativeEsmSpecifiers(filePath);
  }
}

function patchExpoMedia3Version(buildGradlePath) {
  if (!fs.existsSync(buildGradlePath)) return;
  const original = fs.readFileSync(buildGradlePath, 'utf8');
  const patched = original.replace(
    /def androidxMedia3Version = "1\.8\.0"/g,
    'def androidxMedia3Version = "1.9.0"',
  );
  if (patched !== original) fs.writeFileSync(buildGradlePath, patched, 'utf8');
}

/**
 * vision-camera pulls camera-video → media3 1.9.0, but expo-video 3.0.x ships a
 * forked DefaultLoadControl from media3 1.8 (no-arg getAllocator). Rebuild against
 * 1.9 and use the PlayerId overload to avoid AbstractMethodError at playback.
 * Primary fix: patches/expo-video+3.0.16.patch (applied via patch-package in postinstall).
 * This function is a fallback if patch-package did not run.
 */
function patchExpoVideoLoadControl() {
  const buildGradle = path.join(
    process.cwd(),
    'node_modules',
    'expo-video',
    'android',
    'build.gradle',
  );
  patchExpoMedia3Version(buildGradle);

  const loadControl = path.join(
    process.cwd(),
    'node_modules',
    'expo-video',
    'android',
    'src',
    'main',
    'java',
    'expo',
    'modules',
    'video',
    'player',
    'DefaultLoadControl.java',
  );
  if (!fs.existsSync(loadControl)) return;

  const original = fs.readFileSync(loadControl, 'utf8');
  const patched = original
    .replace(
      '@Override\n  public Allocator getAllocator() {\n    return allocator;\n  }',
      '@Override\n  public Allocator getAllocator(PlayerId playerId) {\n    return allocator;\n  }',
    )
    .replace(
      'public boolean shouldContinuePreloading(\n    Timeline timeline, MediaPeriodId mediaPeriodId, long bufferedDurationUs) {',
      'public boolean shouldContinuePreloading(\n    PlayerId playerId, Timeline timeline, MediaPeriodId mediaPeriodId, long bufferedDurationUs) {',
    );
  if (patched !== original) fs.writeFileSync(loadControl, patched, 'utf8');
}

function patchExpoAudioMedia3() {
  const buildGradle = path.join(
    process.cwd(),
    'node_modules',
    'expo-audio',
    'android',
    'build.gradle',
  );
  patchExpoMedia3Version(buildGradle);
}

try {
  patchVisionCameraLib();
} catch (err) {
  // eslint-disable-next-line no-console
  console.warn('[postinstall] patchVisionCameraLib failed:', err);
}

try {
  patchExpoVideoLoadControl();
  patchExpoAudioMedia3();
} catch (err) {
  // eslint-disable-next-line no-console
  console.warn('[postinstall] patchExpoMedia3 failed:', err);
}

