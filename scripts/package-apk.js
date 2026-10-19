const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const apkSource = path.join(rootDir, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const targetDir = path.join(rootDir, 'release', 'Browsy-android');
const targetApk = path.join(targetDir, 'Browsy.apk');

console.log('[Packager] Preparing standalone Android package (Browsy.apk)...');

if (!fs.existsSync(apkSource)) {
  console.error('[Packager Error] APK build output not found at:', apkSource);
  console.error('[Packager Error] Please run "npm run build:android" first.');
  process.exit(1);
}

fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(apkSource, targetApk);

const stats = fs.statSync(targetApk);
const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);

console.log('-------------------------------------------------------------');
console.log(`[Packager] Hotovo! Android balíček byl úspěšně připraven (${sizeMb} MB):`);
console.log(`  -> ${targetApk}`);
console.log('-------------------------------------------------------------');
