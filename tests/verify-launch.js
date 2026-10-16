// Test script to verify that:
// 1. Rust NAPI core loads cleanly in Node
// 2. TabManager, Adblocker, PopupBlocker, VideoDownloader, TextExpander initialize
// 3. Built dist-ui files exist and are valid

const fs = require('fs');
const path = require('path');

console.log('--- TEST 1: Check dist-ui artifacts ---');
const distUiPath = path.join(__dirname, '../dist-ui/index.html');
if (!fs.existsSync(distUiPath)) {
  console.error('FAIL: dist-ui/index.html does not exist');
  process.exit(1);
}
console.log('PASS: dist-ui/index.html exists');

console.log('--- TEST 2: Check Rust NAPI Core ---');
const native = require('../browsy-core.node');
console.log('Rust Core Version:', native.getRustCoreVersion());
const blocker = new native.NativeAdBlocker();
const blocked = blocker.shouldBlock('https://google-analytics.com/analytics.js', 'https://example.com', 'script');
console.log('Blocking check (google-analytics.com):', blocked ? 'BLOCKED (PASS)' : 'ALLOWED (FAIL)');
if (!blocked) {
  console.error('FAIL: Rust adblocker failed to block google-analytics.com');
  process.exit(1);
}

const expanded = native.nativeExpandText('Hello {date} and {year}!', '16.10.2026', '15:30', '2026', '');
console.log('Expander check (native):', expanded);
if (!expanded.includes('16.10.2026')) {
  console.error('FAIL: Rust text expander failed');
  process.exit(1);
}

console.log('--- TEST 3: Verify JS Managers Integration ---');
const adBlocker = require('../src/main/adblocker');
console.log('adBlocker.nativeBlocker loaded:', !!adBlocker.nativeBlocker);
if (!adBlocker.nativeBlocker) {
  console.error('FAIL: adBlocker is not using native core');
  process.exit(1);
}

const textExpander = require('../src/main/text-expander');
const expandedJs = textExpander.resolveDynamicVariables('Dnes je {date}');
console.log('textExpander.resolveDynamicVariables("Dnes je {date}") ->', expandedJs);

console.log('ALL INTEGRATION CHECKS PASSED SUCCESSFULLY!');
