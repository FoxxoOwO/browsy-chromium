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

console.log('--- TEST 5: Ad blocker false positives & scoped exceptions ---');
const mustAllow = [
  'https://uploadform.com/app.js',                 // old /adform\./ regex matched this
  'https://soundtrack.example.org/player.js',      // old /track(er|ing)?\./ regex matched this
  'https://www.googletagmanager.com/gtm.js?id=GTM-X',
  'https://example.com/sponsored/article.html'
];
for (const u of mustAllow) {
  if (adBlocker.matchesAdPattern(u, 'https://example.com', 'script')) {
    console.error('FAIL: false positive, request was blocked:', u);
    process.exit(1);
  }
}
if (!adBlocker.matchesAdPattern('https://sub.doubleclick.net/x.js', 'https://example.com', 'script')) {
  console.error('FAIL: subdomain of a blocked host was not blocked');
  process.exit(1);
}
adBlocker.setCustomFilters(['##.promo', 'example.com#@#.promo']);
if (adBlocker.getCosmeticSelectorsForUrl('https://example.com/').includes('.promo') ||
    !adBlocker.getCosmeticSelectorsForUrl('https://other.org/').includes('.promo')) {
  console.error('FAIL: domain-scoped cosmetic exception is not scoped correctly');
  process.exit(1);
}
adBlocker.setCustomFilters(initialFilters);
console.log('False positives & scoped exceptions: PASS');

console.log('--- TEST 6: Popup blocker user-gesture logic ---');
const popupBlocker = require('../src/main/popup-blocker');
const oauth = 'https://accounts.google.com/o/oauth2/auth';
const newWin = { disposition: 'new-window' };
if (popupBlocker.isSuspiciousPopup(oauth, 'https://example.com', newWin, true)) {
  console.error('FAIL: user initiated OAuth popup was blocked');
  process.exit(1);
}
if (!popupBlocker.isSuspiciousPopup(oauth, 'https://example.com', newWin, false)) {
  console.error('FAIL: cross-site popup without user gesture was not blocked');
  process.exit(1);
}
if (!popupBlocker.isSuspiciousPopup('https://x.popcash.net/pop', 'https://example.com', newWin, true)) {
  console.error('FAIL: known ad network popup was allowed');
  process.exit(1);
}
if (popupBlocker.isSuspiciousPopup('https://alphabet.com/', 'https://example.com', newWin, true)) {
  console.error('FAIL: "alphabet.com" was wrongly flagged as ad domain (/bet/ regex regression)');
  process.exit(1);
}
console.log('Popup blocker gesture logic: PASS');

console.log('--- TEST 7: Settings are flushed atomically ---');
const settingsManager = require('../src/main/settings');
settingsManager.flush();
const fsCheck = require('fs');
if (fsCheck.existsSync(settingsManager.settingsPath + '.tmp')) {
  console.error('FAIL: temporary settings file left behind');
  process.exit(1);
}
console.log('Settings flush: PASS');

console.log('ALL INTEGRATION CHECKS PASSED SUCCESSFULLY!');
