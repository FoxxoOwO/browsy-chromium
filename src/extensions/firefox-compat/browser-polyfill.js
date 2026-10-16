/**
 * WebExtension Polyfill for Chromium
 * Provides the `browser.*` Promise-based API for Firefox extensions running on Chromium.
 */
(function (global) {
  'use strict';

  if (global.browser && global.browser.runtime) {
    return;
  }

  const chromeObj = global.chrome;
  if (!chromeObj) {
    return;
  }

  function promisify(target, fn, context) {
    return function (...args) {
      return new Promise((resolve, reject) => {
        try {
          fn.call(context || target, ...args, (...results) => {
            const err = chromeObj.runtime && chromeObj.runtime.lastError;
            if (err) {
              reject(new Error(err.message || String(err)));
            } else {
              resolve(results.length <= 1 ? results[0] : results);
            }
          });
        } catch (e) {
          reject(e);
        }
      });
    };
  }

  function wrapNamespace(src, asyncMethods = [], syncMethods = []) {
    if (!src) return undefined;
    const dest = {};

    for (const key of Object.keys(src)) {
      const val = src[key];
      if (typeof val === 'function') {
        if (asyncMethods.includes(key)) {
          dest[key] = promisify(src, val);
        } else {
          dest[key] = val.bind(src);
        }
      } else if (typeof val === 'object' && val !== null) {
        dest[key] = val;
      } else {
        Object.defineProperty(dest, key, {
          get: () => src[key],
          set: (v) => { src[key] = v; }
        });
      }
    }
    return dest;
  }

  const browser = {};

  // runtime
  if (chromeObj.runtime) {
    browser.runtime = wrapNamespace(chromeObj.runtime, [
      'sendMessage', 'sendNativeMessage', 'getBackgroundPage', 'getPlatformInfo', 'requestUpdateCheck'
    ]);
    browser.runtime.onMessage = chromeObj.runtime.onMessage;
    browser.runtime.onConnect = chromeObj.runtime.onConnect;
    browser.runtime.onInstalled = chromeObj.runtime.onInstalled;
    browser.runtime.onStartup = chromeObj.runtime.onStartup;
    browser.runtime.getURL = chromeObj.runtime.getURL ? chromeObj.runtime.getURL.bind(chromeObj.runtime) : (p) => p;
    browser.runtime.getManifest = chromeObj.runtime.getManifest ? chromeObj.runtime.getManifest.bind(chromeObj.runtime) : () => ({});
    browser.runtime.id = chromeObj.runtime.id;
  }

  // tabs
  if (chromeObj.tabs) {
    browser.tabs = wrapNamespace(chromeObj.tabs, [
      'get', 'getCurrent', 'create', 'duplicate', 'query', 'highlight', 'update', 'move',
      'reload', 'remove', 'detectLanguage', 'captureVisibleTab', 'executeScript', 'insertCSS',
      'removeCSS', 'setZoom', 'getZoom', 'setZoomSettings', 'getZoomSettings', 'discard', 'sendMessage'
    ]);
    browser.tabs.onCreated = chromeObj.tabs.onCreated;
    browser.tabs.onUpdated = chromeObj.tabs.onUpdated;
    browser.tabs.onMoved = chromeObj.tabs.onMoved;
    browser.tabs.onActivated = chromeObj.tabs.onActivated;
    browser.tabs.onHighlighted = chromeObj.tabs.onHighlighted;
    browser.tabs.onDetached = chromeObj.tabs.onDetached;
    browser.tabs.onAttached = chromeObj.tabs.onAttached;
    browser.tabs.onRemoved = chromeObj.tabs.onRemoved;
    browser.tabs.onReplaced = chromeObj.tabs.onReplaced;
  }

  // storage
  if (chromeObj.storage) {
    browser.storage = {};
    for (const area of ['local', 'sync', 'managed', 'session']) {
      if (chromeObj.storage[area]) {
        browser.storage[area] = {
          get: promisify(chromeObj.storage[area], chromeObj.storage[area].get),
          set: promisify(chromeObj.storage[area], chromeObj.storage[area].set),
          remove: promisify(chromeObj.storage[area], chromeObj.storage[area].remove),
          clear: promisify(chromeObj.storage[area], chromeObj.storage[area].clear),
          getBytesInUse: chromeObj.storage[area].getBytesInUse
            ? promisify(chromeObj.storage[area], chromeObj.storage[area].getBytesInUse)
            : undefined
        };
      }
    }
    browser.storage.onChanged = chromeObj.storage.onChanged;
  }

  // windows
  if (chromeObj.windows) {
    browser.windows = wrapNamespace(chromeObj.windows, [
      'get', 'getCurrent', 'getLastFocused', 'getAll', 'create', 'update', 'remove'
    ]);
    browser.windows.onCreated = chromeObj.windows.onCreated;
    browser.windows.onRemoved = chromeObj.windows.onRemoved;
    browser.windows.onFocusChanged = chromeObj.windows.onFocusChanged;
  }

  // browserAction / action
  const actionObj = chromeObj.action || chromeObj.browserAction;
  if (actionObj) {
    const wrappedAction = wrapNamespace(actionObj, [
      'setTitle', 'getTitle', 'setIcon', 'setPopup', 'getPopup', 'setBadgeText', 'getBadgeText',
      'setBadgeBackgroundColor', 'getBadgeBackgroundColor', 'enable', 'disable'
    ]);
    browser.browserAction = wrappedAction;
    browser.action = wrappedAction;
  }

  // webRequest
  if (chromeObj.webRequest) {
    browser.webRequest = chromeObj.webRequest;
  }

  // cookies
  if (chromeObj.cookies) {
    browser.cookies = wrapNamespace(chromeObj.cookies, ['get', 'getAll', 'set', 'remove', 'getAllCookieStores']);
    browser.cookies.onChanged = chromeObj.cookies.onChanged;
  }

  // contextMenus
  if (chromeObj.contextMenus) {
    browser.contextMenus = wrapNamespace(chromeObj.contextMenus, ['create', 'update', 'remove', 'removeAll']);
    browser.contextMenus.onClicked = chromeObj.contextMenus.onClicked;
  }

  // alarms
  if (chromeObj.alarms) {
    browser.alarms = wrapNamespace(chromeObj.alarms, ['get', 'getAll', 'clear', 'clearAll']);
    browser.alarms.create = chromeObj.alarms.create.bind(chromeObj.alarms);
    browser.alarms.onAlarm = chromeObj.alarms.onAlarm;
  }

  // notifications
  if (chromeObj.notifications) {
    browser.notifications = wrapNamespace(chromeObj.notifications, ['create', 'update', 'clear', 'getAll']);
    browser.notifications.onClosed = chromeObj.notifications.onClosed;
    browser.notifications.onClicked = chromeObj.notifications.onClicked;
  }

  // permissions
  if (chromeObj.permissions) {
    browser.permissions = wrapNamespace(chromeObj.permissions, ['contains', 'request', 'remove', 'getAll']);
  }

  // commands
  if (chromeObj.commands) {
    browser.commands = wrapNamespace(chromeObj.commands, ['getAll']);
    browser.commands.onCommand = chromeObj.commands.onCommand;
  }

  // Fallback proxy to allow calling any unmapped chrome methods
  global.browser = new Proxy(browser, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (chromeObj && prop in chromeObj) {
        return chromeObj[prop];
      }
      return undefined;
    }
  });
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
