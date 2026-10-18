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

// Electron resource types -> names understood by the adblock-rust engine
const REQUEST_TYPE_MAP = {
  mainFrame: 'document',
  subFrame: 'subdocument',
  stylesheet: 'stylesheet',
  script: 'script',
  image: 'image',
  font: 'font',
  object: 'object',
  xhr: 'xmlhttprequest',
  ping: 'ping',
  cspReport: 'csp_report',
  media: 'media',
  webSocket: 'websocket',
  other: 'other'
};

// Known ad / tracker / miner hosts. A request is blocked when its hostname equals one of these
// or is a subdomain of one. This is an O(depth) set lookup instead of ~70 unanchored regexes
// (which e.g. matched "uploadform.com" for /adform\./ or any "track." host).
const BLOCKED_HOSTS = new Set([
  // Ad networks & exchanges
  'doubleclick.net', 'googlesyndication.com', 'google-analytics.com', 'googleadservices.com',
  'adnxs.com', 'advertising.com', 'criteo.com', 'criteo.net', 'taboola.com', 'outbrain.com',
  'moatads.com', 'pubmatic.com', 'rubiconproject.com', 'amazon-adsystem.com', 'adroll.com',
  'adform.net', 'adform.com', 'popads.net', 'popcash.net', 'propellerads.com', 'bidswitch.net',
  'scorecardresearch.com', 'quantserve.com', 'smartadserver.com', 'openx.net', 'adzerk.net',
  'serving-sys.com', 'casalemedia.com', 'indexww.com', '3lift.com', 'sharethrough.com',
  'teads.tv', 'mgid.com', 'revcontent.com', 'exoclick.com', 'juicyads.com', 'trafficjunky.net',
  'exponential.com',
  // Czech / Slovak ad & tracking networks
  'c.imedia.cz', 'ssp.imedia.cz', 'ssp.seznam.cz', 'c.seznam.cz', 'hit.gemius.pl', 'gemius.pl',
  'bbelements.com', 'r2b2.cz', 'cpex.cz',
  // Trackers & session recorders
  'hotjar.com', 'clarity.ms', 'mouseflow.com', 'fullstory.com', 'logrocket.io', 'smartlook.com',
  'chartbeat.com', 'pixel.facebook.com', 'analytics.twitter.com', 'analytics.tiktok.com',
  'bat.bing.com', 'mc.yandex.ru',
  // Cryptominers
  'coinhive.com', 'coin-hive.com', 'webminepool.com'
]);

// Path heuristics - only used when the native engine is unavailable (the native engine already
// ships proper EasyList-style path rules and these are prone to false positives).
const FALLBACK_PATH_PATTERNS = [
  /\/pagead\//,
  /\/adbanner\//,
  /\/adserver\//,
  /\/popunder[./]/,
  /\/show_ads\.js/,
  /\/adsbygoogle\.js/
];

const BLOCKED_NOTIFY_THROTTLE_MS = 150;
const HOST_CACHE_LIMIT = 500;

class AdBlocker {
  constructor() {
    this.statsByTab = new Map(); // webContentsId -> blocked count
    this.totalBlocked = 0;
    this.onFiltersChanged = null;
    this.onAdBlocked = null;
    this._notifyTimers = new Map();
    this._hostCache = new Map();
    this._lastNativeSignature = '';
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
    this.customCosmeticExceptions = new Map(); // domain ('' = global) -> Set<selector>
    this.customNetworkPatterns = [];

    this.reloadCustomFilters(false);
  }

  init() {
    const ses = session.defaultSession;

    // Only intercept network schemes that can carry ads (skips file:, chrome-extension:, devtools:, data:)
    const filter = { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] };

    ses.webRequest.onBeforeRequest(filter, (details, callback) => {
      if (!settingsManager.get('shieldsEnabled', true)) {
        return callback({ cancel: false });
      }

      const url = details.url;
      const isMainFrame = details.resourceType === 'mainFrame';

      // The page that issued the request. For top-level navigations webContents.getURL() still
      // returns the previous page, so the target itself is the source there.
      let sourceUrl = '';
      if (isMainFrame) {
        sourceUrl = url;
      } else {
        const wc = details.webContents;
        if (wc && !wc.isDestroyed()) {
          sourceUrl = wc.getURL();
        }
        sourceUrl = sourceUrl || details.referrer || '';
      }

      if (this.isWhitelisted(url) || (sourceUrl && this.isWhitelisted(sourceUrl))) {
        return callback({ cancel: false });
      }

      // Never block top-level navigations unless the user explicitly added a network rule for them
      if (isMainFrame) {
        if (!this.customNetworkPatterns.some(pattern => pattern.test(url))) {
          return callback({ cancel: false });
        }
      }

      const requestType = REQUEST_TYPE_MAP[details.resourceType] || 'other';
      if (this.matchesAdPattern(url, sourceUrl, requestType)) {
        this.totalBlocked++;
        const tabId = details.webContentsId || details.tabId;
        if (tabId) {
          this.statsByTab.set(tabId, (this.statsByTab.get(tabId) || 0) + 1);
          this._scheduleBlockedNotify(tabId);
        }
        return callback({ cancel: true });
      }

      return callback({ cancel: false });
    });
  }

  /**
   * Coalesces bursts of blocked requests into one UI notification per tab.
   * Pages with heavy tracking can block hundreds of requests per second.
   */
  _scheduleBlockedNotify(tabId) {
    if (this._notifyTimers.has(tabId)) return;
    const timer = setTimeout(() => {
      this._notifyTimers.delete(tabId);
      if (typeof this.onAdBlocked === 'function') {
        this.onAdBlocked(tabId, this.statsByTab.get(tabId) || 0, this.totalBlocked);
      }
    }, BLOCKED_NOTIFY_THROTTLE_MS);
    this._notifyTimers.set(tabId, timer);
  }

  /**
   * Cached hostname extraction (the same few origins are parsed thousands of times per page load).
   */
  _hostOf(url) {
    if (!url) return '';
    let host = this._hostCache.get(url);
    if (host !== undefined) return host;
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch (e) {
      host = '';
    }
    if (this._hostCache.size >= HOST_CACHE_LIMIT) {
      this._hostCache.clear();
    }
    this._hostCache.set(url, host);
    return host;
  }

  _hostMatchesSet(hostname, set) {
    let host = hostname;
    while (host) {
      if (set.has(host)) return true;
      const dot = host.indexOf('.');
      if (dot === -1) return false;
      host = host.slice(dot + 1);
    }
    return false;
  }

  reloadCustomFilters(notify = true) {
    const rules = settingsManager.get('customFilters', []);
    this.customCosmeticGlobal = [];
    this.customCosmeticByDomain = new Map();
    this.customCosmeticExceptions = new Map();
    this.customNetworkPatterns = [];
    const networkRuleStrings = [];

    for (const rawRule of rules) {
      if (typeof rawRule !== 'string') continue;
      const rule = rawRule.trim();
      if (!rule || rule.startsWith('!') || rule.startsWith('# ')) continue;

      // Procedural / scriptlet cosmetic filters are not supported - ignore instead of
      // misinterpreting them as network patterns.
      if (rule.includes('#?#') || rule.includes('#$#') || rule.includes('#%#') || rule.includes('#@?#')) continue;

      // Exception cosmetic rule: domain#@#selector or #@#selector
      const excIdx = rule.indexOf('#@#');
      if (excIdx !== -1) {
        const domainPart = rule.slice(0, excIdx).trim();
        const selector = rule.slice(excIdx + 3).trim();
        if (selector) {
          const domains = domainPart
            ? domainPart.split(',').map(d => d.trim().toLowerCase().replace(/^\*\./, '')).filter(Boolean)
            : [''];
          for (const d of domains) {
            if (!this.customCosmeticExceptions.has(d)) {
              this.customCosmeticExceptions.set(d, new Set());
            }
            this.customCosmeticExceptions.get(d).add(selector);
          }
        }
        continue;
      }

      // Cosmetic hiding rule: domain.com##.selector or ##.selector
      const hideIdx = rule.indexOf('##');
      if (hideIdx !== -1) {
        const domainPart = rule.slice(0, hideIdx).trim();
        const selector = rule.slice(hideIdx + 2).trim();
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

    // Rebuilding the native engine re-parses every list, so do it only when the network rules
    // actually changed (picking a page element only touches cosmetic rules).
    const signature = networkRuleStrings.join('\n');
    if (this.nativeBlocker &&
        typeof this.nativeBlocker.reloadWithCustomRules === 'function' &&
        signature !== this._lastNativeSignature) {
      try {
        this.nativeBlocker.reloadWithCustomRules(networkRuleStrings);
        this._lastNativeSignature = signature;
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
      // Exception rules are only honored by the native engine
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

    const hostname = this._hostOf(url);
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

    // Exceptions are scoped: "site.cz#@#.x" only un-hides .x on site.cz, "#@#.x" everywhere
    for (const [domain, excSelectors] of this.customCosmeticExceptions.entries()) {
      if (domain === '' || hostname === domain || hostname.endsWith('.' + domain)) {
        for (const s of excSelectors) {
          selectors.delete(s);
        }
      }
    }

    return Array.from(selectors);
  }

  matchesAdPattern(url, sourceUrl = '', requestType = 'other') {
    if (this.customNetworkPatterns.length > 0 && this.customNetworkPatterns.some(pattern => pattern.test(url))) {
      return true;
    }
    if (this.nativeBlocker && this.nativeBlocker.shouldBlock(url, sourceUrl, requestType)) {
      return true;
    }
    if (this._hostMatchesSet(this._hostOf(url), BLOCKED_HOSTS)) {
      return true;
    }
    if (!this.nativeBlocker) {
      return FALLBACK_PATH_PATTERNS.some(pattern => pattern.test(url));
    }
    return false;
  }

  isWhitelisted(url) {
    const hostname = this._hostOf(url);
    if (!hostname) return false;
    const list = settingsManager.get('shieldsWhitelist', []);
    for (const item of list) {
      const clean = String(item).toLowerCase();
      if (hostname === clean || hostname.endsWith('.' + clean)) return true;
    }
    return false;
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
    const timer = this._notifyTimers.get(tabId);
    if (timer) {
      clearTimeout(timer);
      this._notifyTimers.delete(tabId);
    }
  }

  getTotalBlocked() {
    return this.totalBlocked;
  }
}

module.exports = new AdBlocker();
