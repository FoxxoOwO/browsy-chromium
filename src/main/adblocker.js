const path = require('path');
const { session } = require('electron');
const settingsManager = require('./settings');

let nativeCore = null;
try {
  nativeCore = require(path.join(__dirname, '../../browsy-core.node'));
  console.log('[AdBlocker] Native Rust adblock-rust core loaded:', nativeCore.getRustCoreVersion());
} catch (e) {
  console.warn('[AdBlocker] Native Rust core not loaded, using JS engine:', e.message);
}

class AdBlocker {
  constructor() {
    this.statsByTab = new Map(); // tabId -> count
    this.totalBlocked = 0;
    this.onFiltersChanged = null;
    this.onAdBlocked = null;
    this.nativeBlocker = (nativeCore && nativeCore.NativeAdBlocker) ? new nativeCore.NativeAdBlocker() : null;

    this.defaultCosmeticSelectors = [
      '.adsbygoogle',
      'ins.adsbygoogle',
      '[id^="div-gpt-ad"]',
      '[id^="google_ads_iframe"]',
      '[id^="google_ads_div"]',
      '[id^="taboola-"]',
      '.taboola-widget',
      '[id^="outbrain_widget"]',
      '.OUTBRAIN',
      '.ad-Slot',
      '.ad-banner',
      '.ad-leaderboard',
      '.advertisement-container',
      '.sponsored-banner',
      '.sklik-reklama',
      '.sklik-box',
      '[id^="ssp-zone-"]',
      '.r2b2-ad',
      '.bb-ad-wrapper'
    ];

    this.customCosmeticGlobal = [];
    this.customCosmeticByDomain = new Map(); // domain -> string[]
    this.customCosmeticExceptions = new Set();
    this.customNetworkPatterns = [];

    this.adPatterns = [
      // Major ad networks & exchanges
      /doubleclick\.net/,
      /googlesyndication\.com/,
      /google-analytics\.com/,
      /googleadservices\.com/,
      /googletagmanager\.com/,
      /adnxs\.com/,
      /advertising\.com/,
      /criteo\./,
      /taboola\.com/,
      /outbrain\.com/,
      /moatads\.com/,
      /pubmatic\.com/,
      /rubiconproject\.com/,
      /amazon-adsystem\.com/,
      /adsystem\./,
      /adroll\.com/,
      /adform\./,
      /popads\.net/,
      /popcash\.net/,
      /propellerads\.com/,
      /bidswitch\.net/,
      /scorecardresearch\.com/,
      /quantserve\.com/,
      /exponential\.com/,
      /yieldmanager\./,
      /smartadserver\.com/,
      /openx\.net/,
      /adzerk\.net/,
      /serving-sys\.com/,
      /casalemedia\.com/,
      /indexww\.com/,
      /3lift\.com/,
      /sharethrough\.com/,
      /teads\.tv/,
      /mgid\.com/,
      /revcontent\.com/,
      /exoclick\.com/,
      /juicyads\.com/,
      /trafficjunky\.net/,

      // Czech / Slovak ad & tracking networks
      /imedia\.cz/,
      /ssp\.seznam\.cz/,
      /c\.seznam\.cz/,
      /sklik\.cz\/.*(reklama|ads|banner)/,
      /hit\.gemius\.pl/,
      /gemius\.pl/,
      /bbelements\.com/,
      /r2b2\.cz/,
      /cpex\.cz/,

      // Trackers & telemetry
      /hotjar\.com/,
      /clarity\.ms/,
      /mouseflow\.com/,
      /fullstory\.com/,
      /logrocket\.io/,
      /smartlook\.com/,
      /chartbeat\.com/,
      /connect\.facebook\.net\/.*\/fbevents\.js/,
      /pixel\.facebook\.com/,
      /analytics\.twitter\.com/,
      /analytics\.tiktok\.com/,
      /sc-static\.net\/scevent\.min\.js/,
      /bat\.bing\.com/,
      /mc\.yandex\.ru/,
      /telemetry\./,
      /track(er|ing)?\./,

      // Cryptominers
      /coinhive\.com/,
      /coin-hive\.com/,
      /cryptoloot\./,
      /coin-have\./,
      /webminepool\.com/,

      // Common ad path patterns
      /\/ads?\.(js|php|html)/,
      /\/advert(s|isement|ing)?\//,
      /\/pagead\//,
      /\/sponsor(ed)?\//,
      /\/adbanner\//,
      /\/adserver\//,
      /\/popunder\//
    ];

    this.reloadCustomFilters(false);
  }

  init() {
    const ses = session.defaultSession;

    ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
      // Don't block browser internal URLs
      if (details.url.startsWith('chrome-extension://') ||
          details.url.startsWith('browsy://') ||
          details.url.startsWith('file://') ||
          details.url.startsWith('devtools://')) {
        return callback({ cancel: false });
      }

      if (!settingsManager.get('shieldsEnabled', true)) {
        return callback({ cancel: false });
      }

      // Check if target or initiating domain is whitelisted
      if (this.isWhitelisted(details.url) || (details.referrer && this.isWhitelisted(details.referrer))) {
        return callback({ cancel: false });
      }

      // Don't block main_frame navigation unless explicitly matched by a custom network rule
      if (details.resourceType === 'mainFrame') {
        const blockedByCustom = this.customNetworkPatterns.some(pattern => pattern.test(details.url));
        if (!blockedByCustom) {
          return callback({ cancel: false });
        }
      }

      // Check against ad patterns using Rust Brave engine + custom rules
      if (this.matchesAdPattern(details.url, details.referrer || '', details.resourceType || 'other')) {
        this.totalBlocked++;
        const tabId = details.webContentsId || details.tabId;
        if (tabId) {
          const current = this.statsByTab.get(tabId) || 0;
          this.statsByTab.set(tabId, current + 1);
          if (typeof this.onAdBlocked === 'function') {
            this.onAdBlocked(tabId, current + 1, this.totalBlocked);
          }
        }
        return callback({ cancel: true });
      }

      return callback({ cancel: false });
    });
  }

  reloadCustomFilters(notify = true) {
    const rules = settingsManager.get('customFilters', []);
    this.customCosmeticGlobal = [];
    this.customCosmeticByDomain = new Map();
    this.customCosmeticExceptions = new Set();
    this.customNetworkPatterns = [];
    const networkRuleStrings = [];

    for (const rawRule of rules) {
      if (typeof rawRule !== 'string') continue;
      const rule = rawRule.trim();
      if (!rule || rule.startsWith('!') || rule.startsWith('# ')) continue;

      // Exception cosmetic rule: domain#@#selector or #@#selector
      if (rule.includes('#@#')) {
        const parts = rule.split('#@#');
        const selector = parts.slice(1).join('#@#').trim();
        if (selector) {
          this.customCosmeticExceptions.add(selector);
        }
        continue;
      }

      // Cosmetic hiding rule: domain.com##.selector or ##.selector
      if (rule.includes('##')) {
        const idx = rule.indexOf('##');
        const domainPart = rule.slice(0, idx).trim();
        const selector = rule.slice(idx + 2).trim();
        if (!selector) continue;

        if (!domainPart || domainPart === '*') {
          this.customCosmeticGlobal.push(selector);
        } else {
          const domains = domainPart.split(',').map(d => d.trim().toLowerCase().replace(/^\*\./, '')).filter(Boolean);
          for (const d of domains) {
            if (!this.customCosmeticByDomain.has(d)) {
              this.customCosmeticByDomain.set(d, []);
            }
            this.customCosmeticByDomain.get(d).push(selector);
          }
        }
        continue;
      }

      // Otherwise treat as network filter rule (Adblock Plus syntax e.g. ||example.com^ or URL pattern)
      networkRuleStrings.push(rule);
      const regex = this._networkRuleToRegex(rule);
      if (regex) {
        this.customNetworkPatterns.push(regex);
      }
    }

    if (this.nativeBlocker && typeof this.nativeBlocker.reloadWithCustomRules === 'function') {
      try {
        this.nativeBlocker.reloadWithCustomRules(networkRuleStrings);
      } catch (e) {
        console.warn('[AdBlocker] Failed to reload native custom rules:', e.message);
      }
    }

    if (notify && typeof this.onFiltersChanged === 'function') {
      this.onFiltersChanged();
    }
  }

  _networkRuleToRegex(rule) {
    try {
      let cleaned = rule.trim();
      // Ignore exception rules in simple regex fallback
      if (cleaned.startsWith('@@')) return null;
      // Strip ABP options like $script,third-party
      const dollarIdx = cleaned.indexOf('$');
      if (dollarIdx > 0) {
        cleaned = cleaned.slice(0, dollarIdx);
      }
      if (!cleaned) return null;

      if (cleaned.startsWith('/') && cleaned.endsWith('/') && cleaned.length > 2) {
        return new RegExp(cleaned.slice(1, -1), 'i');
      }

      let pattern = cleaned
        .replace(/[.+?{}()[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\^/g, '([^a-zA-Z0-9_.%-]|$)');

      if (pattern.startsWith('||')) {
        pattern = '^https?:\\/\\/([a-z0-9-]+\\.)*' + pattern.slice(2);
      } else if (pattern.startsWith('|')) {
        pattern = '^' + pattern.slice(1);
      }
      if (pattern.endsWith('|')) {
        pattern = pattern.slice(0, -1) + '$';
      }

      return new RegExp(pattern, 'i');
    } catch (e) {
      return null;
    }
  }

  getCustomFilters() {
    return settingsManager.get('customFilters', []);
  }

  addCustomFilter(rule) {
    if (!rule || typeof rule !== 'string') return this.getCustomFilters();
    const trimmed = rule.trim();
    if (!trimmed) return this.getCustomFilters();

    const list = [...this.getCustomFilters()];
    if (!list.includes(trimmed)) {
      list.push(trimmed);
      settingsManager.set('customFilters', list);
      this.reloadCustomFilters(true);
    }
    return list;
  }

  removeCustomFilter(rule) {
    if (!rule || typeof rule !== 'string') return this.getCustomFilters();
    const trimmed = rule.trim();
    const list = this.getCustomFilters().filter(item => item.trim() !== trimmed);
    settingsManager.set('customFilters', list);
    this.reloadCustomFilters(true);
    return list;
  }

  setCustomFilters(rulesArray) {
    if (!Array.isArray(rulesArray)) return this.getCustomFilters();
    const seen = new Set();
    const cleaned = [];
    for (const r of rulesArray) {
      if (typeof r !== 'string') continue;
      const t = r.trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      cleaned.push(t);
    }
    settingsManager.set('customFilters', cleaned);
    this.reloadCustomFilters(true);
    return cleaned;
  }

  getCosmeticSelectorsForUrl(url) {
    if (!url || !settingsManager.get('shieldsEnabled', true)) {
      return [];
    }
    if (this.isWhitelisted(url)) {
      return [];
    }

    let hostname = '';
    try {
      hostname = new URL(url).hostname.toLowerCase();
    } catch (e) {
      return [];
    }
    if (!hostname) return [];

    const selectors = new Set([
      ...this.defaultCosmeticSelectors,
      ...this.customCosmeticGlobal
    ]);

    for (const [domain, domainSelectors] of this.customCosmeticByDomain.entries()) {
      if (hostname === domain || hostname.endsWith('.' + domain)) {
        for (const s of domainSelectors) {
          selectors.add(s);
        }
      }
    }

    for (const exc of this.customCosmeticExceptions) {
      selectors.delete(exc);
    }

    return Array.from(selectors);
  }

  matchesAdPattern(url, sourceUrl = '', requestType = 'other') {
    if (this.customNetworkPatterns.some(pattern => pattern.test(url))) {
      return true;
    }
    if (this.nativeBlocker) {
      if (this.nativeBlocker.shouldBlock(url, sourceUrl, requestType)) {
        return true;
      }
    }
    return this.adPatterns.some(pattern => pattern.test(url));
  }

  isWhitelisted(url) {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      const list = settingsManager.get('shieldsWhitelist', []);
      return list.some(item => {
        const clean = String(item).toLowerCase();
        return hostname === clean || hostname.endsWith('.' + clean);
      });
    } catch (e) {
      return false;
    }
  }

  toggleWhitelist(hostname) {
    if (!hostname) return false;
    const clean = hostname.toLowerCase();
    const list = [...settingsManager.get('shieldsWhitelist', [])];
    const index = list.findIndex(item => String(item).toLowerCase() === clean);
    if (index >= 0) {
      list.splice(index, 1);
    } else {
      list.push(clean);
    }
    settingsManager.set('shieldsWhitelist', list);
    if (typeof this.onFiltersChanged === 'function') {
      this.onFiltersChanged();
    }
    return list.includes(clean);
  }

  getStatsForTab(tabId) {
    return this.statsByTab.get(tabId) || 0;
  }

  resetTabStats(tabId) {
    this.statsByTab.delete(tabId);
  }

  getTotalBlocked() {
    return this.totalBlocked;
  }
}

module.exports = new AdBlocker();
