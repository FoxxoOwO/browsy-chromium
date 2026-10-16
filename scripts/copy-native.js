const fs = require('fs');
const path = require('path');

const targetDir = path.join(__dirname, '../src-native/target/release');
const dest = path.join(__dirname, '../browsy-core.node');

let src = null;
if (process.platform === 'win32') {
  src = path.join(targetDir, 'browsy_native.dll');
} else if (process.platform === 'darwin') {
  src = path.join(targetDir, 'libbrowsy_native.dylib');
} else {
  src = path.join(targetDir, 'libbrowsy_native.so');
}

if (fs.existsSync(src)) {
  fs.copyFileSync(src, dest);
  console.log(`[Build] Successfully copied ${src} -> ${dest}`);
} else {
  console.error(`[Build Error] Native binary not found at ${src}`);
  console.error('Please run "cargo build --release --manifest-path src-native/Cargo.toml" first.');
  process.exit(1);
}
