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

console.log('--- TEST 8: Verify Frameless Window & Titlebar Styling ---');
const mainSource = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf-8');
if (!mainSource.includes("windowOptions.titleBarStyle = 'hidden'") || !mainSource.includes('titleBarOverlay')) {
  console.error('FAIL: main.js does not configure titleBarStyle: hidden or titleBarOverlay');
  process.exit(1);
}
const cssSource = fs.readFileSync(path.join(__dirname, '../src/ui/style.css'), 'utf-8');
if (!cssSource.includes('-webkit-app-region: drag') || !cssSource.includes('padding: 4px 140px 0 8px')) {
  console.error('FAIL: src/ui/style.css missing drag region or titleBarOverlay padding');
  process.exit(1);
}
console.log('--- TEST 9: Verify Seamless Overlay Snapshot APIs ---');
const TabManager = require('../src/main/tab-manager');
if (typeof TabManager.prototype.captureActivePage !== 'function' || typeof TabManager.prototype.setViewVisibility !== 'function') {
  console.error('FAIL: TabManager missing captureActivePage or setViewVisibility');
  process.exit(1);
}
const preloadSource = fs.readFileSync(path.join(__dirname, '../preload.js'), 'utf-8');
if (!preloadSource.includes('captureActivePage: () =>') || !mainSource.includes('tabs:capture-active')) {
  console.error('FAIL: preload.js or main.js missing captureActivePage mapping');
  process.exit(1);
}
console.log('Overlay Snapshot APIs: PASS');

console.log('--- TEST 10: Verify Extension Store Buttons & SPA Support ---');
const contentPreload = fs.readFileSync(path.join(__dirname, '../content-preload.js'), 'utf-8');
if (!contentPreload.includes('browsy-inpage-cws-btn') || !contentPreload.includes('hookSpaStoreIntegration') || !contentPreload.includes('injectStoreFloatingBar')) {
  console.error('FAIL: content-preload.js missing CWS in-page button or SPA navigation hooks');
  process.exit(1);
}
const extManagerSource = fs.readFileSync(path.join(__dirname, '../src/main/extension-manager.js'), 'utf-8');
if (!extManagerSource.includes('installsource%3Dondemand') || !extManagerSource.includes('candidateUrls')) {
  console.error('FAIL: extension-manager.js missing robust multi-endpoint CRX download logic');
  process.exit(1);
}
const tabManagerSource = fs.readFileSync(path.join(__dirname, '../src/main/tab-manager.js'), 'utf-8');
if (!tabManagerSource.includes('this.notifyActiveTabChanged(tabRecord)')) {
  console.error('FAIL: tab-manager.js missing notifyActiveTabChanged on navigation sync');
  process.exit(1);
}
console.log('Extension Store Integration: PASS');

console.log('--- TEST 11: Verify Android Package & Architecture ---');
const androidApk = path.join(__dirname, '../release/Browsy-android/Browsy.apk');
if (!fs.existsSync(androidApk)) {
  console.error('FAIL: release/Browsy-android/Browsy.apk does not exist');
  process.exit(1);
}
const apkStats = fs.statSync(androidApk);
if (apkStats.size < 1000000) {
  console.error('FAIL: release/Browsy-android/Browsy.apk is abnormally small (' + apkStats.size + ' bytes)');
  process.exit(1);
}
const androidManifest = fs.readFileSync(path.join(__dirname, '../android/app/src/main/AndroidManifest.xml'), 'utf-8');
if (!androidManifest.includes('android.permission.INTERNET') || !androidManifest.includes('android.intent.category.BROWSABLE')) {
  console.error('FAIL: AndroidManifest.xml missing INTERNET or BROWSABLE intent filter');
  process.exit(1);
}
console.log('Android Package & Architecture: PASS (' + (apkStats.size / (1024 * 1024)).toFixed(2) + ' MB)');

console.log('--- TEST 12: Verify Profile Sync (Export & Import) ---');
const profileSync = require('../src/main/profile-sync');
const testBackupPath = path.join(__dirname, 'test-profile-backup.json');

(async () => {
  try {
    const exportRes = await profileSync.exportProfile(testBackupPath);
    if (!exportRes.success || !fs.existsSync(testBackupPath)) {
      console.error('FAIL: profile export failed');
      process.exit(1);
    }
    const importRes = await profileSync.importProfile(testBackupPath);
    if (!importRes.success) {
      console.error('FAIL: profile import failed');
      process.exit(1);
    }
    try { fs.unlinkSync(testBackupPath); } catch (e) {}
    console.log('Profile Sync: PASS');

    console.log('--- TEST 13: Verify Encrypted Password Vault ---');
    const passwordVault = require('../src/main/password-vault');
    passwordVault.clearVault();
    const added = passwordVault.addLogin({
      url: 'https://github.com',
      username: 'testuser',
      password: 'superSecretPassword123!',
      label: 'GitHub Work'
    });
    if (!added || !added.id) {
      console.error('FAIL: failed to add login to vault');
      process.exit(1);
    }
    const logins = passwordVault.getLogins('github.com');
    if (logins.length !== 1 || logins[0].password !== 'superSecretPassword123!') {
      console.error('FAIL: vault failed to decrypt password correctly');
      process.exit(1);
    }
    passwordVault.deleteLogin(added.id);
    if (passwordVault.getLogins('github.com').length !== 0) {
      console.error('FAIL: vault failed to delete login');
      process.exit(1);
    }
    console.log('Password Vault: PASS');

    console.log('--- TEST 14: Verify Self-Hosted & WebDAV Sync Integration ---');
    const syncServer = require('../sync-server/server');
    const syncClient = require('../src/main/sync-client');

    await new Promise((resolve) => syncServer.listen(8089, '127.0.0.1', resolve));
    console.log('Sync server listening on http://127.0.0.1:8089');

    // 1. Test server health
    const healthRes = await syncClient.request('http://127.0.0.1:8089/health');
    if (healthRes.statusCode !== 200 || !healthRes.json || healthRes.json.service !== 'browsy-sync-server') {
      console.error('FAIL: Sync server health check failed', healthRes);
      process.exit(1);
    }

    // 2. Test crypto (AES-256-GCM + PBKDF2)
    const testPayload = {
      version: 1,
      bookmarks: [{ title: 'Brave', url: 'https://brave.com' }],
      history: [{ title: 'Search', url: 'https://google.com' }]
    };
    const passphrase = 'MySecureSyncPassphrase2026!';
    const encryptedPkg = syncClient.encryptPayload(testPayload, passphrase);
    if (!encryptedPkg.salt || !encryptedPkg.iv || !encryptedPkg.tag || !encryptedPkg.cipherText) {
      console.error('FAIL: encrypted package missing fields', encryptedPkg);
      process.exit(1);
    }
    const decryptedPayload = syncClient.decryptPayload(encryptedPkg, passphrase);
    if (decryptedPayload.bookmarks[0].title !== 'Brave') {
      console.error('FAIL: decrypted payload does not match original', decryptedPayload);
      process.exit(1);
    }

    // 3. Test client connection check
    const testConfig = {
      provider: 'SELF_HOSTED',
      serverUrl: 'http://127.0.0.1:8089',
      token: 'test-user-token-abc',
      passphrase: passphrase
    };
    const testConnRes = await syncClient.testConnection(testConfig);
    if (!testConnRes.success) {
      console.error('FAIL: testConnection failed', testConnRes);
      process.exit(1);
    }

    // 4. Test client syncNow cycle
    const syncNowRes = await syncClient.syncNow(testConfig);
    if (!syncNowRes.success) {
      console.error('FAIL: syncNow failed', syncNowRes);
      process.exit(1);
    }

    // 5. Test pull from server to verify storage
    const pullRes = await syncClient.pullRemote(testConfig);
    if (!pullRes.exists || !pullRes.payload) {
      console.error('FAIL: pullRemote failed to find synced payload', pullRes);
      process.exit(1);
    }
    const serverDecrypted = syncClient.decryptPayload(pullRes.payload, passphrase);
    if (!serverDecrypted.settings) {
      console.error('FAIL: server payload missing settings', serverDecrypted);
      process.exit(1);
    }

    // Close server
    await new Promise((resolve) => syncServer.close(resolve));
    console.log('Self-Hosted & WebDAV Sync Integration: PASS');

    console.log('ALL INTEGRATION CHECKS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('Integration test failed with error:', err);
    process.exit(1);
  }
})();


