const { session } = require('electron');
const settingsManager = require('./settings');

class AdBlocker {
  constructor() {
    this.statsByTab = new Map(); // tabId -> count
    this.totalBlocked = 0;
    this.adPatterns = [
      // Major ad networks & exchanges
      /doubleclick\.net/,
      /googlesyndication\.com/,
      /google-analytics\.com/,
      /googleadservices\.com/,
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

      // Trackers & telemetry
      /hotjar\.com/,
      /clarity\.ms/,
      /mouseflow\.com/,
      /chartbeat\.com/,
      /connect\.facebook\.net\/.*\/fbevents\.js/,
      /pixel\.facebook\.com/,
      /analytics\.twitter\.com/,
      /telemetry\./,
      /track(er|ing)?\./,

      // Cryptominers
      /coinhive\.com/,
      /coin-hive\.com/,
      /cryptoloot\./,
      /coin-have\./,

      // Common ad path patterns
      /\/ads?\.(js|php|html)/,
      /\/advert(s|isement|ing)?\//,
      /\/pagead\//,
      /\/sponsor(ed)?\//,
      /\/adbanner\//,
      /\/adserver\//,
      /\/popunder\//
    ];
  }

  init() {
    const ses = session.defaultSession;

    ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
      // Don't block browser internal URLs
      if (details.url.startsWith('chrome-extension://') ||
          details.url.startsWith('browsy://') ||
          details.url.startsWith('file://')) {
        return callback({ cancel: false });
      }

      if (!settingsManager.get('shieldsEnabled', true)) {
        return callback({ cancel: false });
      }

      // Check if domain is whitelisted
      if (this.isWhitelisted(details.url)) {
        return callback({ cancel: false });
      }

      // Check against ad patterns
      if (this.matchesAdPattern(details.url)) {
        this.totalBlocked++;
        const tabId = details.webContentsId || details.tabId;
        if (tabId) {
          const current = this.statsByTab.get(tabId) || 0;
          this.statsByTab.set(tabId, current + 1);
        }
        return callback({ cancel: true });
      }

      return callback({ cancel: false });
    });
  }

  matchesAdPattern(url) {
    return this.adPatterns.some(pattern => pattern.test(url));
  }

  isWhitelisted(url) {
    try {
      const hostname = new URL(url).hostname;
      const list = settingsManager.get('shieldsWhitelist', []);
      return list.some(item => hostname === item || hostname.endsWith('.' + item));
    } catch (e) {
      return false;
    }
  }

  toggleWhitelist(hostname) {
    const list = [...settingsManager.get('shieldsWhitelist', [])];
    const index = list.indexOf(hostname);
    if (index >= 0) {
      list.splice(index, 1);
    } else {
      list.push(hostname);
    }
    settingsManager.set('shieldsWhitelist', list);
    return list.includes(hostname);
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
