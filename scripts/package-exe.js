const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const electronDistDir = path.join(rootDir, 'node_modules', 'electron', 'dist');
const releaseDir = path.join(rootDir, 'release');
const targetDir = path.join(releaseDir, 'Browsy-win32-x64');
const appResourcesDir = path.join(targetDir, 'resources', 'app');

console.log('[Packager] Preparing standalone Windows executable (Browsy.exe)...');

if (!fs.existsSync(electronDistDir)) {
  console.error('[Packager Error] Electron distribution not found at:', electronDistDir);
  process.exit(1);
}

const oldExe = path.join(targetDir, 'electron.exe');
const newExe = path.join(targetDir, 'Browsy.exe');

// 1. Copy Electron runtime binaries if not already present (or if --full passed)
if (!fs.existsSync(newExe) || process.argv.includes('--full')) {
  if (fs.existsSync(targetDir)) {
    console.log('[Packager] Removing previous build directory...');
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  fs.mkdirSync(targetDir, { recursive: true });

  console.log('[Packager] Copying Chromium/Electron runtime...');
  fs.cpSync(electronDistDir, targetDir, { recursive: true });

  if (fs.existsSync(oldExe)) {
    fs.renameSync(oldExe, newExe);
  }

  const defaultAsar = path.join(targetDir, 'resources', 'default_app.asar');
  if (fs.existsSync(defaultAsar)) {
    fs.rmSync(defaultAsar, { force: true });
  }
} else {
  console.log('[Packager] Existing Browsy.exe runtime found, updating resources/app in-place...');
}

// 5. Copy Browsy application files & native Rust core into resources/app
console.log('[Packager] Bundling Browsy application files & Rust NAPI core...');
fs.mkdirSync(appResourcesDir, { recursive: true });

const filesToCopy = [
  'package.json',
  'main.js',
  'preload.js',
  'content-preload.js',
  'browsy-core.node'
];

for (const file of filesToCopy) {
  const srcPath = path.join(rootDir, file);
  if (fs.existsSync(srcPath)) {
    try {
      fs.copyFileSync(srcPath, path.join(appResourcesDir, file));
    } catch (e) {
      // Ignore EBUSY/EPERM if browsy-core.node is already loaded by a running Browsy.exe instance
    }
  }
}

const dirsToCopy = [
  'dist-ui',
  'src',
  path.join('node_modules', 'adm-zip')
];

for (const relDir of dirsToCopy) {
  const srcPath = path.join(rootDir, relDir);
  const destPath = path.join(appResourcesDir, relDir);
  if (fs.existsSync(srcPath)) {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.cpSync(srcPath, destPath, { recursive: true, force: true });
  }
}

console.log('-------------------------------------------------------------');
console.log('[Packager] Hotovo! Spustitelný soubor byl úspěšně aktualizován:');
console.log(`  -> ${newExe}`);
console.log('-------------------------------------------------------------');
