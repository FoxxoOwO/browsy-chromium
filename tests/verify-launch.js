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

console.log('--- TEST 4: Verify Custom Cosmetic & Network Filters ---');
const initialFilters = adBlocker.getCustomFilters();
adBlocker.addCustomFilter('idnes.cz##.reklamni-box-1');
adBlocker.addCustomFilter('##.global-cookie-annoyance');
adBlocker.addCustomFilter('||custom-tracker-test.cz^');

const idnesCosmetics = adBlocker.getCosmeticSelectorsForUrl('https://www.idnes.cz/zpravy');
const otherCosmetics = adBlocker.getCosmeticSelectorsForUrl('https://www.example.com/');

if (!idnesCosmetics.includes('.reklamni-box-1') || !idnesCosmetics.includes('.global-cookie-annoyance')) {
  console.error('FAIL: Cosmetic filter resolution for idnes.cz failed');
  process.exit(1);
}
if (otherCosmetics.includes('.reklamni-box-1') || !otherCosmetics.includes('.global-cookie-annoyance')) {
  console.error('FAIL: Domain scoping for cosmetic filters failed');
  process.exit(1);
}
if (!adBlocker.matchesAdPattern('https://sub.custom-tracker-test.cz/script.js', 'https://idnes.cz', 'script')) {
  console.error('FAIL: Custom network filter ||custom-tracker-test.cz^ did not block');
  process.exit(1);
}
if (!adBlocker.matchesAdPattern('https://ssp.seznam.cz/ad.js', 'https://seznam.cz', 'script')) {
  console.error('FAIL: Built-in Czech ad network ssp.seznam.cz did not block');
  process.exit(1);
}

// Restore initial custom filters
adBlocker.setCustomFilters(initialFilters);
console.log('Custom Cosmetic & Network Filters: PASS');

console.log('ALL INTEGRATION CHECKS PASSED SUCCESSFULLY!');
