/**
 * uBlock Origin (Integrated Edition for Browsy Chromium)
 * High-performance ad and tracker blocker background service.
 */

const blockedStats = {
  total: 0,
  byTab: {}
};

const settings = {
  enabled: true,
  whitelistedDomains: []
};

// Known ad and tracking patterns
const adPatterns = [
  /google-analytics\.com/,
  /googlesyndication\.com/,
  /doubleclick\.net/,
  /adservice\.google\./,
  /adnxs\.com/,
  /advertising\.com/,
  /scorecardresearch\.com/,
  /criteo\.com/,
  /taboola\.com/,
  /outbrain\.com/,
  /moatads\.com/,
  /pubmatic\.com/,
  /rubiconproject\.com/,
  /amazon-adsystem\.com/,
  /adsystem\./,
  /adroll\.com/,
  /adform\.net/,
  /popads\.net/,
  /popcash\.net/,
  /bidswitch\.net/,
  /exponential\.com/,
  /chartbeat\.com/,
  /hotjar\.com/,
  /clarity\.ms/,
  /facebook\.com\/tr\//,
  /connect\.facebook\.net\/.*\/fbevents\.js/,
  /\/ads\//,
  /\/ad\.js/,
  /\/advertisement\./,
  /\/pagead\//,
  /\/sponsor\//,
  /\/telemetry\//,
  /coinhive\.com/,
  /coin-hive\.com/
];

function isWhitelisted(url) {
  try {
    const host = new URL(url).hostname;
    return settings.whitelistedDomains.some(d => host === d || host.endsWith('.' + d));
  } catch (e) {
    return false;
  }
}

function shouldBlock(url) {
  if (!settings.enabled) return false;
  if (isWhitelisted(url)) return false;
  return adPatterns.some(pattern => pattern.test(url));
}

// Intercept requests via Chrome WebRequest API (Manifest V2)
if (chrome.webRequest && chrome.webRequest.onBeforeRequest) {
  chrome.webRequest.onBeforeRequest.addListener(
    function (details) {
      if (details.url && shouldBlock(details.url)) {
        blockedStats.total++;
        if (details.tabId >= 0) {
          blockedStats.byTab[details.tabId] = (blockedStats.byTab[details.tabId] || 0) + 1;
          const count = blockedStats.byTab[details.tabId];
          if (chrome.browserAction && chrome.browserAction.setBadgeText) {
            chrome.browserAction.setBadgeText({
              tabId: details.tabId,
              text: count > 99 ? '99+' : String(count)
            });
            chrome.browserAction.setBadgeBackgroundColor({
              tabId: details.tabId,
              color: '#d32f2f'
            });
          }
        }
        return { cancel: true };
      }
      return { cancel: false };
    },
    { urls: ['<all_urls>'] },
    ['blocking']
  );
}

// Reset tab stats when tab navigates or closes
if (chrome.tabs) {
  if (chrome.tabs.onUpdated) {
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (changeInfo.status === 'loading') {
        blockedStats.byTab[tabId] = 0;
        if (chrome.browserAction && chrome.browserAction.setBadgeText) {
          chrome.browserAction.setBadgeText({ tabId, text: '' });
        }
      }
    });
  }
  if (chrome.tabs.onRemoved) {
    chrome.tabs.onRemoved.addListener((tabId) => {
      delete blockedStats.byTab[tabId];
    });
  }
}

// Message handler for popup UI
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getStats') {
    const tabId = request.tabId;
    sendResponse({
      enabled: settings.enabled,
      tabBlocked: (tabId && blockedStats.byTab[tabId]) || 0,
      totalBlocked: blockedStats.total,
      whitelisted: request.url ? isWhitelisted(request.url) : false
    });
  } else if (request.action === 'toggleEnable') {
    settings.enabled = !settings.enabled;
    sendResponse({ enabled: settings.enabled });
  } else if (request.action === 'toggleWhitelist') {
    if (request.hostname) {
      const idx = settings.whitelistedDomains.indexOf(request.hostname);
      if (idx >= 0) {
        settings.whitelistedDomains.splice(idx, 1);
      } else {
        settings.whitelistedDomains.push(request.hostname);
      }
      sendResponse({ whitelisted: settings.whitelistedDomains.includes(request.hostname) });
    }
  }
  return true;
});
