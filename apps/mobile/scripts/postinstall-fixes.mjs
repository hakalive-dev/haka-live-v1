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

try {
  patchVisionCameraLib();
} catch (err) {
  // eslint-disable-next-line no-console
  console.warn('[postinstall] patchVisionCameraLib failed:', err);
}

