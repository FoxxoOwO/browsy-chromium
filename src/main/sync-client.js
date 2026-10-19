const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { URL } = require('url');
const settingsManager = require('./settings');
const adBlocker = require('./adblocker');
const textExpander = require('./text-expander');

class SyncClient {
  constructor() {
    this.syncing = false;
  }

  getConfig() {
    const cfg = settingsManager.get('syncConfig', {
      enabled: false,
      provider: 'NONE',
      serverUrl: '',
      token: '',
      username: '',
      passphrase: '',
      autoSync: true,
      lastSyncTime: 0
    });
    return { ...cfg };
  }

  saveConfig(newConfig) {
    const current = this.getConfig();
    const updated = { ...current, ...newConfig };
    settingsManager.set('syncConfig', updated);
    settingsManager.flush();
    return updated;
  }

  deriveKey(passphrase, salt) {
    return crypto.pbkdf2Sync(passphrase, salt, 10000, 32, 'sha256');
  }

  encryptPayload(dataObj, passphrase) {
    if (!passphrase) {
      throw new Error('Pro šifrování synchronizace je vyžadována bezpečnostní fráze (passphrase)');
    }
    const jsonStr = JSON.stringify(dataObj);
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const key = this.deriveKey(passphrase, salt);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(jsonStr, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      version: 1,
      timestamp: Date.now(),
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      cipherText: encrypted.toString('hex')
    };
  }

  decryptPayload(encryptedPkg, passphrase) {
    if (!passphrase) {
      throw new Error('Pro dešifrování synchronizace je vyžadována bezpečnostní fráze');
    }
    if (!encryptedPkg || !encryptedPkg.salt || !encryptedPkg.iv || !encryptedPkg.tag || !encryptedPkg.cipherText) {
      throw new Error('Neplatný nebo neúplný formát šifrovaného balíčku');
    }

    const salt = Buffer.from(encryptedPkg.salt, 'hex');
    const iv = Buffer.from(encryptedPkg.iv, 'hex');
    const tag = Buffer.from(encryptedPkg.tag, 'hex');
    const cipherText = Buffer.from(encryptedPkg.cipherText, 'hex');

    const key = this.deriveKey(passphrase, salt);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(cipherText), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  }

  /**
   * Universal HTTP/HTTPS request utility
   */
  async request(urlString, options = {}, body = null) {
    return new Promise((resolve, reject) => {
      let targetUrl;
      try {
        targetUrl = new URL(urlString);
      } catch (e) {
        return reject(new Error('Neplatná URL adresa: ' + urlString));
      }

      const isHttps = targetUrl.protocol === 'https:';
      const client = isHttps ? https : http;

      const reqOptions = {
        method: options.method || 'GET',
        headers: {
          'User-Agent': 'Browsy-Chromium-Sync/1.0',
          ...(options.headers || {})
        },
        timeout: options.timeout || 15000
      };

      const req = client.request(targetUrl, reqOptions, (res) => {
        let resData = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { resData += chunk; });
        res.on('end', () => {
          let json = null;
          try {
            if (resData) json = JSON.parse(resData);
          } catch (_) {}

          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: resData,
            json
          });
        });
      });

      req.on('error', (err) => reject(new Error('Chyba síťového spojení: ' + err.message)));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Časový limit požadavku vypršel (timeout)'));
      });

      if (body) {
        req.write(typeof body === 'string' ? body : JSON.stringify(body));
      }
      req.end();
    });
  }

  getAuthHeaders(config) {
    const headers = {};
    if (config.provider === 'SELF_HOSTED') {
      if (config.token) {
        headers['Authorization'] = `Bearer ${config.token.trim()}`;
      }
    } else if (config.provider === 'WEBDAV') {
      if (config.username && config.token) {
        const credentials = Buffer.from(`${config.username.trim()}:${config.token.trim()}`).toString('base64');
        headers['Authorization'] = `Basic ${credentials}`;
      } else if (config.token) {
        headers['Authorization'] = `Bearer ${config.token.trim()}`;
      }
    }
    return headers;
  }

  cleanServerUrl(url) {
    if (!url) return '';
    let clean = url.trim();
    if (!/^https?:\/\//i.test(clean)) {
      clean = 'http://' + clean;
    }
    return clean.replace(/\/+$/, '');
  }

  async testConnection(customConfig = null) {
    const config = customConfig || this.getConfig();
    if (config.provider === 'NONE') {
      return { success: false, error: 'Synchronizace je vypnuta (vyberte poskytovatele)' };
    }

    const cleanUrl = this.cleanServerUrl(config.serverUrl);
    if (!cleanUrl) {
      return { success: false, error: 'Zadejte platnou URL adresu synchronizačního serveru' };
    }

    const authHeaders = this.getAuthHeaders(config);

    if (config.provider === 'SELF_HOSTED') {
      try {
        const res = await this.request(`${cleanUrl}/api/sync/status`, {
          method: 'GET',
          headers: authHeaders,
          timeout: 7000
        });

        if (res.statusCode === 200 && res.json && res.json.service === 'browsy-sync-server') {
          return {
            success: true,
            provider: 'SELF_HOSTED',
            message: `Připojeno k Browsy Sync Serveru v${res.json.version || '1.0'}`
          };
        } else if (res.statusCode === 401) {
          return { success: false, error: 'Chyba ověření: Neplatný přístupový token serveru' };
        } else {
          return { success: false, error: `Server vrátil nečekaný stav: HTTP ${res.statusCode}` };
        }
      } catch (err) {
        return { success: false, error: err.message };
      }
    }

    if (config.provider === 'WEBDAV') {
      try {
        // Try PROPFIND or HEAD on the WebDAV endpoint
        const targetUrl = cleanUrl.endsWith('.json') ? cleanUrl : `${cleanUrl}/browsy-sync.json`;
        const res = await this.request(targetUrl, {
          method: 'PROPFIND',
          headers: {
            ...authHeaders,
            'Depth': '0'
          },
          timeout: 7000
        });

        // Many WebDAV servers return 207 Multi-Status, 200 OK, 404 Not Found (file doesn't exist yet, but server is WebDAV), or 405
        if ([200, 207, 404, 405].includes(res.statusCode)) {
          return {
            success: true,
            provider: 'WEBDAV',
            message: `WebDAV úložiště je dostupné (HTTP ${res.statusCode})`
          };
        } else if (res.statusCode === 401 || res.statusCode === 403) {
          return { success: false, error: 'Chyba ověření WebDAV: Neplatné uživatelské jméno nebo heslo/token' };
        } else {
          return { success: false, error: `WebDAV server vrátil stav HTTP ${res.statusCode}` };
        }
      } catch (err) {
        return { success: false, error: err.message };
      }
    }

    return { success: false, error: 'Neznámý poskytovatel synchronizace' };
  }

  async pullRemote(config) {
    const cleanUrl = this.cleanServerUrl(config.serverUrl);
    const authHeaders = this.getAuthHeaders(config);

    if (config.provider === 'SELF_HOSTED') {
      const res = await this.request(`${cleanUrl}/api/sync/pull`, {
        method: 'GET',
        headers: authHeaders
      });

      if (res.statusCode === 200 && res.json && res.json.payload) {
        return { exists: true, payload: res.json.payload, updatedAt: res.json.updatedAt };
      }
      if (res.statusCode === 404) {
        return { exists: false, payload: null };
      }
      throw new Error(`Chyba stahování ze serveru: HTTP ${res.statusCode} ${res.body}`);
    }

    if (config.provider === 'WEBDAV') {
      const targetUrl = cleanUrl.endsWith('.json') ? cleanUrl : `${cleanUrl}/browsy-sync.json`;
      const res = await this.request(targetUrl, {
        method: 'GET',
        headers: authHeaders
      });

      if (res.statusCode === 200 && res.json && res.json.cipherText) {
        return { exists: true, payload: res.json, updatedAt: res.json.timestamp || Date.now() };
      }
      if (res.statusCode === 404) {
        return { exists: false, payload: null };
      }
      throw new Error(`Chyba stahování z WebDAV: HTTP ${res.statusCode}`);
    }

    throw new Error('Nepodporovaný poskytovatel synchronizace');
  }

  async pushRemote(config, encryptedPkg) {
    const cleanUrl = this.cleanServerUrl(config.serverUrl);
    const authHeaders = this.getAuthHeaders(config);

    if (config.provider === 'SELF_HOSTED') {
      const res = await this.request(`${cleanUrl}/api/sync/push`, {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        }
      }, encryptedPkg);

      if (res.statusCode !== 200 || !res.json || !res.json.success) {
        throw new Error(`Chyba ukládání na server: HTTP ${res.statusCode} ${res.body}`);
      }
      return res.json;
    }

    if (config.provider === 'WEBDAV') {
      const targetUrl = cleanUrl.endsWith('.json') ? cleanUrl : `${cleanUrl}/browsy-sync.json`;
      const res = await this.request(targetUrl, {
        method: 'PUT',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        }
      }, JSON.stringify(encryptedPkg, null, 2));

      if (![200, 201, 204].includes(res.statusCode)) {
        throw new Error(`Chyba zápisu na WebDAV: HTTP ${res.statusCode} ${res.body}`);
      }
      return { success: true };
    }

    throw new Error('Nepodporovaný poskytovatel synchronizace');
  }

  getLocalData() {
    const allSettings = settingsManager.getAll();
    const bookmarks = Array.isArray(allSettings.bookmarks) ? allSettings.bookmarks : [];
    const history = Array.isArray(allSettings.history) ? allSettings.history : [];
    const customFilters = adBlocker.getCustomFilters ? adBlocker.getCustomFilters() : (allSettings.customFilters || []);
    const textExpanderSnippets = textExpander.getSnippets ? textExpander.getSnippets() : (allSettings.textExpanderSnippets || []);

    return {
      version: 1,
      deviceId: 'browsy-desktop-' + crypto.randomBytes(4).toString('hex'),
      timestamp: Date.now(),
      settings: {
        tabLayout: allSettings.tabLayout || 'horizontal',
        defaultSearchEngine: allSettings.defaultSearchEngine || 'google',
        shieldsEnabled: allSettings.shieldsEnabled !== false,
        popupBlockerEnabled: allSettings.popupBlockerEnabled !== false,
        videoDownloaderEnabled: allSettings.videoDownloaderEnabled !== false,
        textExpanderEnabled: allSettings.textExpanderEnabled !== false,
        forceWebDarkMode: !!allSettings.forceWebDarkMode
      },
      bookmarks,
      history,
      customFilters,
      textExpanderSnippets
    };
  }

  mergeSyncData(local, remote) {
    if (!remote) return local;

    // 1. Merge Bookmarks (match by normalized URL, union with latest info)
    const bookmarkMap = new Map();
    for (const b of (remote.bookmarks || [])) {
      if (b && b.url) bookmarkMap.set(b.url.trim().toLowerCase(), b);
    }
    for (const b of (local.bookmarks || [])) {
      if (b && b.url) {
        const key = b.url.trim().toLowerCase();
        const existing = bookmarkMap.get(key);
        if (!existing || (b.createdAt && b.createdAt > (existing.createdAt || 0))) {
          bookmarkMap.set(key, b);
        }
      }
    }
    const mergedBookmarks = Array.from(bookmarkMap.values());

    // 2. Merge History (match by normalized URL, limit to latest 500)
    const historyMap = new Map();
    for (const h of (remote.history || [])) {
      if (h && h.url) historyMap.set(h.url.trim().toLowerCase(), h);
    }
    for (const h of (local.history || [])) {
      if (h && h.url) {
        const key = h.url.trim().toLowerCase();
        const existing = historyMap.get(key);
        if (!existing || (h.visitedAt && h.visitedAt > (existing.visitedAt || 0))) {
          historyMap.set(key, h);
        }
      }
    }
    const mergedHistory = Array.from(historyMap.values())
      .sort((a, b) => (b.visitedAt || 0) - (a.visitedAt || 0))
      .slice(0, 500);

    // 3. Merge Custom Filters (Set union)
    const filterSet = new Set([...(remote.customFilters || []), ...(local.customFilters || [])]);
    const mergedFilters = Array.from(filterSet).filter(Boolean);

    // 4. Merge Text Expander Snippets (match by trigger)
    const snippetMap = new Map();
    for (const s of (remote.textExpanderSnippets || [])) {
      if (s && s.trigger) snippetMap.set(s.trigger.trim().toLowerCase(), s);
    }
    for (const s of (local.textExpanderSnippets || [])) {
      if (s && s.trigger) {
        snippetMap.set(s.trigger.trim().toLowerCase(), s);
      }
    }
    const mergedSnippets = Array.from(snippetMap.values());

    // 5. Settings: newest wins or combine
    const remoteTimestamp = remote.timestamp || 0;
    const localTimestamp = local.timestamp || 0;
    const baseSettings = remoteTimestamp > localTimestamp
      ? { ...local.settings, ...remote.settings }
      : { ...remote.settings, ...local.settings };

    return {
      version: 1,
      timestamp: Date.now(),
      deviceId: local.deviceId || 'browsy-desktop',
      settings: baseSettings,
      bookmarks: mergedBookmarks,
      history: mergedHistory,
      customFilters: mergedFilters,
      textExpanderSnippets: mergedSnippets
    };
  }

  applyToLocalStorage(data) {
    if (!data) return;

    if (data.bookmarks) {
      settingsManager.set('bookmarks', data.bookmarks);
    }
    if (data.history) {
      settingsManager.set('history', data.history);
    }
    if (data.customFilters && adBlocker.setCustomFilters) {
      adBlocker.setCustomFilters(data.customFilters);
    }
    if (data.textExpanderSnippets) {
      settingsManager.set('textExpanderSnippets', data.textExpanderSnippets);
    }
    if (data.settings) {
      settingsManager.update(data.settings);
    }
    settingsManager.flush();
  }

  async syncNow(customConfig = null) {
    if (this.syncing) {
      return { success: false, error: 'Synchronizace již probíhá' };
    }

    const config = customConfig || this.getConfig();
    if (config.provider === 'NONE') {
      return { success: false, error: 'Synchronizace není aktivní' };
    }
    if (!config.serverUrl) {
      return { success: false, error: 'Chybí URL adresa serveru' };
    }
    if (!config.passphrase) {
      return { success: false, error: 'Chybí bezpečnostní heslo pro E2E šifrování (passphrase)' };
    }

    this.syncing = true;
    try {
      // 1. Gather local state
      const localData = this.getLocalData();

      // 2. Pull remote encrypted payload
      const remoteRes = await this.pullRemote(config);
      let mergedData = localData;

      if (remoteRes.exists && remoteRes.payload) {
        // 3. Decrypt remote payload
        let remoteData;
        try {
          remoteData = this.decryptPayload(remoteRes.payload, config.passphrase);
        } catch (decErr) {
          throw new Error('Chyba dešifrování: Nesprávná bezpečnostní fráze (passphrase) nebo poškozená data.');
        }

        // 4. Merge remote with local data
        mergedData = this.mergeSyncData(localData, remoteData);
      }

      // 5. Apply merged state to local storage
      this.applyToLocalStorage(mergedData);

      // 6. Encrypt merged state with passphrase
      const encryptedPkg = this.encryptPayload(mergedData, config.passphrase);

      // 7. Push encrypted state to remote
      await this.pushRemote(config, encryptedPkg);

      // 8. Update last sync time
      const now = Date.now();
      this.saveConfig({ lastSyncTime: now });

      return {
        success: true,
        lastSyncTime: now,
        bookmarksCount: mergedData.bookmarks.length,
        historyCount: mergedData.history.length,
        filtersCount: mergedData.customFilters.length,
        snippetsCount: mergedData.textExpanderSnippets.length
      };
    } finally {
      this.syncing = false;
    }
  }
}

module.exports = new SyncClient();
