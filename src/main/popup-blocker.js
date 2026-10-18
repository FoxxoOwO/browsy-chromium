const settingsManager = require('./settings');

// Popups opened within this window after a real mouse/keyboard input count as user initiated
const USER_GESTURE_WINDOW_MS = 1500;

// Hostnames of known popup/popunder ad networks (matched on the host itself or any parent domain)
const POPUP_AD_HOSTS = [
  'popcash.net', 'popads.net', 'propellerads.com', 'exoclick.com', 'juicyads.com',
  'trafficjunky.net', 'adsterra.com', 'hilltopads.net', 'onclickads.net', 'clickadu.com',
  'popunder.net', 'ero-advertising.com', 'adcash.com', 'mgid.com', 'revcontent.com'
];

// Heuristic words that are suspicious only when the popup was NOT opened by the user
const SUSPICIOUS_HOST_WORDS = /(casino|betting|redirect|affiliate|onclick|popunder|clickid|trk\d*\.)/i;

class PopupBlocker {
  constructor() {
    this.blockedPopupsByTab = new Map(); // webContentsId -> Array<{ url, time, id }>
    this.lastUserInputByTab = new Map(); // webContentsId -> timestamp
    this.totalBlocked = 0;
    this.onPopupBlockedCallback = null;
  }

  setCallback(cb) {
    this.onPopupBlockedCallback = cb;
  }

  attachToWebContents(webContents, onAllowedTabCreate) {
    const tabId = webContents.id;

    // Track genuine user input so user-initiated popups (OAuth login, payments) are not blocked
    webContents.on('before-input-event', (event, input) => {
      if (input.type === 'mouseDown' || input.type === 'keyDown' || input.type === 'touchStart') {
        this.lastUserInputByTab.set(tabId, Date.now());
      }
    });
    webContents.once('destroyed', () => this.lastUserInputByTab.delete(tabId));

    webContents.setWindowOpenHandler((details) => {
      const targetUrl = details.url;
      const currentUrl = webContents.getURL();

      const allowHandler = () => {
        if (typeof onAllowedTabCreate === 'function' && targetUrl && targetUrl !== 'about:blank') {
          onAllowedTabCreate(targetUrl);
          return { action: 'deny' };
        }
        return { action: 'allow' };
      };

      if (!settingsManager.get('popupBlockerEnabled', true)) {
        return allowHandler();
      }

      // Check if domain is whitelisted
      if (this.isWhitelisted(currentUrl) || this.isWhitelisted(targetUrl)) {
        return allowHandler();
      }

      const lastInput = this.lastUserInputByTab.get(tabId) || 0;
      const hasUserGesture = (Date.now() - lastInput) <= USER_GESTURE_WINDOW_MS;

      if (this.isSuspiciousPopup(targetUrl, currentUrl, details, hasUserGesture)) {
        this.totalBlocked++;
        const list = this.blockedPopupsByTab.get(tabId) || [];
        const record = {
          id: 'popup_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          url: targetUrl,
          time: new Date().toLocaleTimeString(),
          disposition: details.disposition
        };
        list.push(record);
        // Keep memory bounded on pages that spam popups
        if (list.length > 50) list.shift();
        this.blockedPopupsByTab.set(tabId, list);

        if (this.onPopupBlockedCallback) {
          this.onPopupBlockedCallback(tabId, record, list.length);
        }

        console.log(`[PopupBlocker] Blocked popup for tab ${tabId}: ${targetUrl}`);
        return { action: 'deny' };
      }

      return allowHandler();
    });
  }

  isAdHost(hostname) {
    return POPUP_AD_HOSTS.some(h => hostname === h || hostname.endsWith('.' + h));
  }

  isSuspiciousPopup(targetUrl, sourceUrl, details, hasUserGesture = false) {
    let targetHost = '';
    try {
      targetHost = targetUrl ? new URL(targetUrl).hostname.toLowerCase() : '';
    } catch (e) {
      // Unparseable URL: let the browser handle it unless nobody asked for it
      return !hasUserGesture;
    }

    // Known popup ad networks are blocked even right after a click (click-hijacking)
    if (targetHost && this.isAdHost(targetHost)) {
      return true;
    }

    // Anything the user explicitly triggered is allowed
    if (hasUserGesture) {
      return false;
    }

    // Without user gesture: blank windows and cross-site windows are very likely ads/popunders
    if (!targetUrl || targetUrl === 'about:blank') {
      return true;
    }
    if (SUSPICIOUS_HOST_WORDS.test(targetHost)) {
      return true;
    }
    try {
      const sourceHost = sourceUrl ? new URL(sourceUrl).hostname.toLowerCase() : '';
      if (sourceHost && targetHost !== sourceHost) {
        return true;
      }
    } catch (e) {
      return false;
    }

    return false;
  }

  isWhitelisted(url) {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      const list = settingsManager.get('popupWhitelist', []);
      return list.some(item => {
        const clean = String(item).toLowerCase();
        return hostname === clean || hostname.endsWith('.' + clean);
      });
    } catch (e) {
      return false;
    }
  }

  toggleWhitelist(hostname) {
    const list = [...settingsManager.get('popupWhitelist', [])];
    const index = list.indexOf(hostname);
    if (index >= 0) {
      list.splice(index, 1);
    } else {
      list.push(hostname);
    }
    settingsManager.set('popupWhitelist', list);
    return list.includes(hostname);
  }

  getBlockedPopups(tabId) {
    return this.blockedPopupsByTab.get(tabId) || [];
  }

  clearTab(tabId) {
    this.blockedPopupsByTab.delete(tabId);
  }
}

module.exports = new PopupBlocker();
