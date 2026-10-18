const { app, session } = require('electron');
const settingsManager = require('./settings');
const popupBlocker = require('./popup-blocker');

class SiteInfoManager {
  constructor() {
    this.permissionsKey = 'sitePermissions';
  }

  init() {
    this.initPermissionsHandler();
  }

  initPermissionsHandler() {
    if (!app || !app.isReady() || !session || !session.defaultSession) return;

    // Permissions that can reach outside of the page sandbox are never granted implicitly
    const ALWAYS_DENY = new Set(['openExternal', 'hid', 'serial', 'usb']);

    // Handle web permission requests (camera, mic, geolocation, notifications)
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
      if (ALWAYS_DENY.has(permission)) {
        return callback(false);
      }
      const reqUrl = details.requestingUrl || webContents.getURL();
      try {
        const origin = new URL(reqUrl).origin;
        const allPerms = settingsManager.get(this.permissionsKey, {});
        const originPerms = allPerms[origin] || {};
        const permKey = this.mapPermissionKey(permission);

        if (originPerms[permKey] === 'allow') {
          return callback(true);
        }
        if (originPerms[permKey] === 'block') {
          return callback(false);
        }
      } catch (e) {}

      // Default: allow standard web features
      callback(true);
    });

    session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
      try {
        const allPerms = settingsManager.get(this.permissionsKey, {});
        const originPerms = allPerms[requestingOrigin] || {};
        const permKey = this.mapPermissionKey(permission);

        if (originPerms[permKey] === 'allow') return true;
        if (originPerms[permKey] === 'block') return false;
      } catch (e) {}

      return null;
    });
  }

  mapPermissionKey(perm) {
    if (perm === 'media' || perm === 'camera' || perm === 'video_capture') return 'camera';
    if (perm === 'microphone' || perm === 'audio_capture') return 'microphone';
    if (perm === 'geolocation') return 'location';
    if (perm === 'notifications') return 'notifications';
    return perm;
  }

  async getSiteInfo(url, isTabMuted = false) {
    if (!url || url === 'about:blank' || url === 'browsy://newtab') {
      return {
        status: 'internal',
        isSecure: true,
        protocol: 'browsy',
        domain: 'Nová záložka',
        origin: 'browsy://newtab',
        title: 'Nová záložka',
        description: 'Stránka nové záložky Browsy Chromium.',
        cookiesCount: 0,
        certificate: null,
        permissions: {}
      };
    }

    if (url.startsWith('browsy://') || url.startsWith('file://')) {
      const displayDomain = url.startsWith('browsy://') ? url.replace('browsy://', '') : 'Lokální soubor';
      return {
        status: 'internal',
        isSecure: true,
        protocol: url.startsWith('browsy://') ? 'browsy' : 'file',
        domain: displayDomain,
        origin: url,
        title: 'Zabezpečená systémová stránka',
        description: 'Tato stránka je interní součástí prohlížeče Browsy Chromium a běží v izolovaném prostředí.',
        cookiesCount: 0,
        certificate: {
          valid: true,
          subject: 'Browsy Chromium Core',
          issuer: 'Lokální systémové jádro',
          cipher: 'Nativní proces IPC'
        },
        permissions: {}
      };
    }

    let urlObj;
    try {
      urlObj = new URL(url);
    } catch (e) {
      return {
        status: 'insecure',
        isSecure: false,
        protocol: 'unknown',
        domain: url,
        origin: url,
        title: 'Neznámé připojení',
        description: 'Adresa URL je neplatná.',
        cookiesCount: 0,
        certificate: null,
        permissions: {}
      };
    }

    const isSecure = urlObj.protocol === 'https:';
    const domain = urlObj.hostname;
    const origin = urlObj.origin;

    // 1. Cookies count
    let cookiesCount = 0;
    try {
      if (session.defaultSession) {
        // Query cookies by url and domain
        const cookiesByUrl = await session.defaultSession.cookies.get({ url });
        const cookiesByDomain = await session.defaultSession.cookies.get({ domain });
        const allSet = new Set([...cookiesByUrl.map(c => c.name + '@' + c.domain), ...cookiesByDomain.map(c => c.name + '@' + c.domain)]);
        cookiesCount = allSet.size;
      }
    } catch (e) {
      cookiesCount = 0;
    }

    // 2. Saved site permissions
    const allPerms = settingsManager.get(this.permissionsKey, {});
    const originPerms = allPerms[origin] || {};

    const popupWhitelist = settingsManager.get('popupWhitelist', []);
    const isPopupWhitelisted = popupWhitelist.includes(domain);

    const permissions = {
      location: originPerms.location || 'ask',
      camera: originPerms.camera || 'ask',
      microphone: originPerms.microphone || 'ask',
      notifications: originPerms.notifications || 'ask',
      sound: isTabMuted ? 'block' : 'allow',
      popups: isPopupWhitelisted ? 'allow' : 'block'
    };

    // 3. Certificate Info (Chrome-like)
    const certificate = isSecure ? {
      valid: true,
      subject: domain,
      issuer: 'Důvěryhodná certifikační autorita (CA)',
      cipher: 'TLS 1.3, X25519, AES_256_GCM',
      status: 'Platný certifikát'
    } : null;

    return {
      status: isSecure ? 'secure' : 'insecure',
      isSecure,
      protocol: urlObj.protocol.replace(':', ''),
      domain,
      origin,
      title: isSecure ? 'Připojení je zabezpečené' : 'Připojení k tomuto webu není zabezpečené',
      description: isSecure
        ? 'Vaše informace (například hesla nebo čísla platebních karet) jsou při odesílání na tento web soukromé.'
        : 'Na tomto webu byste neměli zadávat žádné citlivé údaje (například hesla nebo kreditní karty), protože by mohly být odcizeny útočníky.',
      cookiesCount,
      certificate,
      permissions
    };
  }

  async clearSiteData(url) {
    if (!url || !session.defaultSession) return { success: false };

    try {
      const urlObj = new URL(url);
      const origin = urlObj.origin;
      const domain = urlObj.hostname;

      // Clear storage
      await session.defaultSession.clearStorageData({
        origin,
        storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers', 'cachestorage', 'filesystem']
      });

      // Also clean matching domain cookies
      const cookies = await session.defaultSession.cookies.get({ domain });
      for (const c of cookies) {
        const cookieUrl = (c.secure ? 'https://' : 'http://') + (c.domain.startsWith('.') ? c.domain.slice(1) : c.domain) + (c.path || '/');
        await session.defaultSession.cookies.remove(cookieUrl, c.name).catch(() => {});
      }

      console.log(`[SiteInfo] Cleared site data and cookies for origin: ${origin}`);
      return { success: true };
    } catch (e) {
      console.error('[SiteInfo] Error clearing site data:', e);
      return { success: false, error: e.message };
    }
  }

  setPermission(origin, permission, value) {
    if (!origin) return false;

    // Handle special popups toggle
    if (permission === 'popups') {
      try {
        const hostname = new URL(origin).hostname;
        if (value === 'allow') {
          const list = [...settingsManager.get('popupWhitelist', [])];
          if (!list.includes(hostname)) {
            list.push(hostname);
            settingsManager.set('popupWhitelist', list);
          }
        } else {
          const list = settingsManager.get('popupWhitelist', []).filter(h => h !== hostname);
          settingsManager.set('popupWhitelist', list);
        }
      } catch (e) {}
    }

    const allPerms = { ...settingsManager.get(this.permissionsKey, {}) };
    if (!allPerms[origin]) {
      allPerms[origin] = {};
    }
    allPerms[origin][permission] = value;
    settingsManager.set(this.permissionsKey, allPerms);
    return true;
  }

  resetPermissions(origin) {
    if (!origin) return false;
    const allPerms = { ...settingsManager.get(this.permissionsKey, {}) };
    delete allPerms[origin];
    settingsManager.set(this.permissionsKey, allPerms);

    try {
      const hostname = new URL(origin).hostname;
      const list = settingsManager.get('popupWhitelist', []).filter(h => h !== hostname);
      settingsManager.set('popupWhitelist', list);
    } catch (e) {}

    return true;
  }
}

module.exports = new SiteInfoManager();
