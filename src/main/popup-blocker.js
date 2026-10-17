const settingsManager = require('./settings');

class PopupBlocker {
  constructor() {
    this.blockedPopupsByTab = new Map(); // webContentsId -> Array<{ url, time, id }>
    this.totalBlocked = 0;
    this.onPopupBlockedCallback = null;
  }

  setCallback(cb) {
    this.onPopupBlockedCallback = cb;
  }

  attachToWebContents(webContents, onAllowedTabCreate) {
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

      const enabled = settingsManager.get('popupBlockerEnabled', true);
      if (!enabled) {
        return allowHandler();
      }

      // Check if domain is whitelisted
      if (this.isWhitelisted(currentUrl) || this.isWhitelisted(targetUrl)) {
        return allowHandler();
      }

      // Check if this looks like a popup ad or unsolicited window
      // User gestures can still be abused by clicking anywhere on shady streaming / download sites.
      // We block popups to external advertising origins or when opened without explicit standard target.
      const isSuspicious = this.isSuspiciousPopup(targetUrl, currentUrl, details);

      if (isSuspicious) {
        this.totalBlocked++;
        const tabId = webContents.id;
        const list = this.blockedPopupsByTab.get(tabId) || [];
        const record = {
          id: 'popup_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          url: targetUrl,
          time: new Date().toLocaleTimeString(),
          disposition: details.disposition
        };
        list.push(record);
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

  isSuspiciousPopup(targetUrl, sourceUrl, details) {
    if (!targetUrl || targetUrl === 'about:blank') {
      return true;
    }

    try {
      const targetHost = new URL(targetUrl).hostname;
      const sourceHost = sourceUrl ? new URL(sourceUrl).hostname : '';

      // Ad/redirect domains are always blocked as popups
      const adDomains = [
        /popcash/, /popads/, /propellerads/, /bet/, /casino/, /click/,
        /traffic/, /redirect/, /affiliate/, /onclick/, /syndication/
      ];
      if (adDomains.some(re => re.test(targetHost))) {
        return true;
      }

      // Different domains opened via new-window disposition
      if (details.disposition === 'new-window' && sourceHost && targetHost !== sourceHost) {
        return true;
      }
    } catch (e) {
      return false;
    }

    return false;
  }

  isWhitelisted(url) {
    try {
      const hostname = new URL(url).hostname;
      const list = settingsManager.get('popupWhitelist', []);
      return list.some(item => hostname === item || hostname.endsWith('.' + item));
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
