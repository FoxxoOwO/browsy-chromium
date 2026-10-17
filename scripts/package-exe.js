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

// 1. Clean previous target directory
if (fs.existsSync(targetDir)) {
  console.log('[Packager] Removing previous build directory...');
  fs.rmSync(targetDir, { recursive: true, force: true });
}
fs.mkdirSync(targetDir, { recursive: true });

// 2. Copy Electron runtime binaries
console.log('[Packager] Copying Chromium/Electron runtime...');
fs.cpSync(electronDistDir, targetDir, { recursive: true });

// 3. Rename electron.exe -> Browsy.exe
const oldExe = path.join(targetDir, 'electron.exe');
const newExe = path.join(targetDir, 'Browsy.exe');
if (fs.existsSync(oldExe)) {
  fs.renameSync(oldExe, newExe);
}

// 4. Remove default_app.asar so Electron boots our resources/app automatically
const defaultAsar = path.join(targetDir, 'resources', 'default_app.asar');
if (fs.existsSync(defaultAsar)) {
  fs.rmSync(defaultAsar, { force: true });
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
    fs.copyFileSync(srcPath, path.join(appResourcesDir, file));
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
    fs.cpSync(srcPath, destPath, { recursive: true });
  }
}

console.log('-------------------------------------------------------------');
console.log('[Packager] Hotovo! Spustitelný soubor byl úspěšně vytvořen:');
console.log(`  -> ${newExe}`);
console.log('-------------------------------------------------------------');
