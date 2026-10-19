const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { app, session, dialog } = require('electron');

class ExtensionManager {
  constructor() {
    this.userDataPath = (app && typeof app.getPath === 'function') ? app.getPath('userData') : path.join(process.cwd(), '.browsy-data');
    this.extensionsDir = path.join(this.userDataPath, 'extensions');
    this.registryPath = path.join(this.userDataPath, 'extensions-registry.json');
    this.compatPolyfillPath = path.join(__dirname, '../extensions/firefox-compat/browser-polyfill.js');

    this.ensureDirs();
    this.installedExtensions = this.loadRegistry();
  }

  ensureDirs() {
    if (!fs.existsSync(this.extensionsDir)) {
      fs.mkdirSync(this.extensionsDir, { recursive: true });
    }
  }

  loadRegistry() {
    try {
      if (fs.existsSync(this.registryPath)) {
        const raw = fs.readFileSync(this.registryPath, 'utf8');
        return JSON.parse(raw);
      }
    } catch (err) {
      console.error('[ExtensionManager] Error loading registry:', err);
    }
    return {};
  }

  saveRegistry() {
    try {
      fs.writeFileSync(this.registryPath, JSON.stringify(this.installedExtensions, null, 2), 'utf8');
    } catch (err) {
      console.error('[ExtensionManager] Error saving registry:', err);
    }
  }

  async loadExt(dirPath, options = {}) {
    const ses = session.defaultSession;
    if (ses.extensions && typeof ses.extensions.loadExtension === 'function') {
      return await ses.extensions.loadExtension(dirPath, options);
    }
    return await ses.loadExtension(dirPath, options);
  }

  async removeExt(id) {
    const ses = session.defaultSession;
    if (ses.extensions && typeof ses.extensions.removeExtension === 'function') {
      return await ses.extensions.removeExtension(id);
    }
    return await ses.removeExtension(id);
  }

  async initExtensions() {
    // 1. Ensure built-in uBlock Origin is registered
    await this.ensureBuiltinUBlock();

    // 2. Load all enabled extensions into the default session
    for (const [id, meta] of Object.entries(this.installedExtensions)) {
      if (meta.enabled && fs.existsSync(meta.path)) {
        try {
          const loaded = await this.loadExt(meta.path, { allowFileAccess: true });
          meta.loadedId = loaded.id || id;
          console.log(`[ExtensionManager] Successfully loaded extension: ${meta.name} (${id})`);
        } catch (err) {
          console.error(`[ExtensionManager] Failed to load extension ${meta.name}:`, err);
        }
      }
    }
  }

  async ensureBuiltinUBlock() {
    const builtinUBlockDir = path.join(__dirname, '../extensions/ublock-origin');
    if (fs.existsSync(builtinUBlockDir) && fs.existsSync(path.join(builtinUBlockDir, 'manifest.json'))) {
      if (!this.installedExtensions['ublock-origin']) {
        try {
          const manifestRaw = fs.readFileSync(path.join(builtinUBlockDir, 'manifest.json'), 'utf8');
          const manifest = JSON.parse(manifestRaw);
          this.installedExtensions['ublock-origin'] = {
            id: 'ublock-origin',
            name: manifest.name || 'uBlock Origin (Integrovaný)',
            version: manifest.version || '1.58.0',
            description: manifest.description || 'Efektivní blokátor reklam a sledovačů.',
            manifestVersion: manifest.manifest_version || 2,
            source: 'builtin',
            path: builtinUBlockDir,
            enabled: true,
            isBuiltin: true
          };
          this.saveRegistry();
        } catch (e) {
          console.error('[ExtensionManager] Error registering built-in uBlock:', e);
        }
      } else if (this.installedExtensions['ublock-origin'].path !== builtinUBlockDir) {
        this.installedExtensions['ublock-origin'].path = builtinUBlockDir;
        this.saveRegistry();
      }
    }
  }

  /**
   * Converts a CRX (Chrome/Opera) buffer to a standard ZIP buffer by stripping headers.
   */
  crxToZipBuffer(buf) {
    if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
      return buf;
    }
    const pkIndex = buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    if (pkIndex !== -1) {
      return buf.subarray(pkIndex);
    }
    return buf;
  }

  /**
   * Detects whether a URL belongs to Chrome Web Store, Opera Add-ons, or Firefox AMO.
   */
  detectStoreUrl(url) {
    if (!url || typeof url !== 'string') return { isStore: false };

    // 1. Chrome Web Store
    const chromeMatch = url.match(/(?:chromewebstore\.google\.com|chrome\.google\.com\/webstore)\/detail\/(?:[^\/]+\/)?([a-p]{32})/i);
    if (chromeMatch) {
      return {
        isStore: true,
        store: 'chrome',
        id: chromeMatch[1].toLowerCase(),
        storeName: 'Chrome Web Store'
      };
    }

    // 2. Opera Add-ons
    const operaMatch = url.match(/addons\.opera\.com\/(?:[a-zA-Z-]+\/)?extensions\/details\/([a-zA-Z0-9_-]+)/i);
    if (operaMatch) {
      return {
        isStore: true,
        store: 'opera',
        id: operaMatch[1],
        storeName: 'Opera Add-ons'
      };
    }

    // 3. Firefox Add-ons (AMO)
    const firefoxMatch = url.match(/addons\.mozilla\.org\/(?:[a-zA-Z-]+\/)?firefox\/addon\/([a-zA-Z0-9_-]+)/i);
    if (firefoxMatch) {
      return {
        isStore: true,
        store: 'firefox',
        id: firefoxMatch[1],
        storeName: 'Firefox Add-ons'
      };
    }

    return { isStore: false };
  }

  /**
   * Install extension from memory Buffer (CRX, ZIP, XPI).
   */
  async installFromBuffer(buffer, filename = 'extension.crx', source = 'chrome') {
    const isFirefox = source === 'firefox' || filename.endsWith('.xpi');
    const zipBuffer = this.crxToZipBuffer(buffer);

    const tempExtId = 'ext_' + Date.now();
    const targetDir = path.join(this.extensionsDir, tempExtId);
    fs.mkdirSync(targetDir, { recursive: true });

    try {
      const zip = new AdmZip(zipBuffer);
      zip.extractAllTo(targetDir, true);
    } catch (e) {
      fs.rmSync(targetDir, { recursive: true, force: true });
      throw new Error('Chyba při rozbalování archivu doplňku: ' + e.message);
    }

    const manifestPath = path.join(targetDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
      throw new Error('V doplňku chybí soubor manifest.json.');
    }

    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (e) {
      fs.rmSync(targetDir, { recursive: true, force: true });
      throw new Error('Neplatný JSON v manifest.json: ' + e.message);
    }

    // Resolve name from _locales if __MSG_...__
    let extName = manifest.name || filename;
    if (extName && extName.startsWith('__MSG_') && extName.endsWith('__')) {
      const key = extName.slice(6, -2);
      const locales = ['cs', 'en_US', 'en_GB', 'en'];
      for (const loc of locales) {
        const msgPath = path.join(targetDir, '_locales', loc, 'messages.json');
        if (fs.existsSync(msgPath)) {
          try {
            const msgs = JSON.parse(fs.readFileSync(msgPath, 'utf8'));
            if (msgs[key] && msgs[key].message) {
              extName = msgs[key].message;
              break;
            }
          } catch (e) {}
        }
      }
    }

    // Adapt Firefox extension for Chromium if needed
    if (isFirefox || manifest.browser_specific_settings || manifest.applications) {
      manifest = this.adaptFirefoxManifest(manifest, targetDir);
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    }

    // Load into Electron session
    try {
      const loaded = await this.loadExt(targetDir, { allowFileAccess: true });
      const finalId = loaded.id || tempExtId;

      const record = {
        id: finalId,
        name: extName,
        version: manifest.version || '1.0.0',
        description: manifest.description || '',
        manifestVersion: manifest.manifest_version || 2,
        source: source,
        path: targetDir,
        enabled: true,
        homepageUrl: manifest.homepage_url || '',
        icons: manifest.icons || {}
      };

      this.installedExtensions[finalId] = record;
      this.saveRegistry();
      console.log(`[ExtensionManager] Successfully installed from ${source}: ${record.name} (${finalId})`);
      return { success: true, extension: record };
    } catch (err) {
      fs.rmSync(targetDir, { recursive: true, force: true });
      throw new Error('Chyba při načítání doplňku do Chromia: ' + err.message);
    }
  }

  /**
   * Installs extension directly from Chrome Web Store, Opera Add-ons, or Firefox AMO.
   */
  async installFromStore(store, idOrSlug, title = '') {
    console.log(`[ExtensionManager] Installing from ${store}: ${idOrSlug}`);

    if (store === 'chrome') {
      const match = idOrSlug.match(/[a-p]{32}/i);
      const extId = match ? match[0].toLowerCase() : idOrSlug.toLowerCase();
      const candidateUrls = [
        `https://clients2.google.com/service/update2/crx?response=redirect&prod=chromecrx&prodversion=141.0.7390.55&acceptformat=crx3&x=id%3D${extId}%26installsource%3Dondemand%26uc`,
        `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=130.0&acceptformat=crx2,crx3&x=id%3D${extId}%26uc`,
        `https://clients2.google.com/service/update2/crx?response=redirect&prod=chromecrx&prodversion=132.0&acceptformat=crx3&x=id%3D${extId}%26installsource%3Dondemand%26uc`
      ];

      let lastStatus = 0;
      let lastError = null;

      for (const downloadUrl of candidateUrls) {
        try {
          const res = await fetch(downloadUrl, {
            redirect: 'follow',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
            }
          });
          lastStatus = res.status;
          if (res.ok && res.status === 200) {
            const buffer = Buffer.from(await res.arrayBuffer());
            if (buffer.length > 200) {
              return await this.installFromBuffer(buffer, `${extId}.crx`, 'chrome');
            }
          }
        } catch (err) {
          lastError = err;
        }
      }

      if (lastStatus === 204) {
        throw new Error('Doplněk nebyl na serveru Google nalezen nebo není dostupný pro veřejné stažení (HTTP 204).');
      }
      throw new Error(lastError ? lastError.message : `Chyba při stahování z Chrome Web Store (HTTP ${lastStatus || 'neznámá'}).`);
    }

    if (store === 'opera') {
      const slug = idOrSlug.replace(/[^a-zA-Z0-9_-]/g, '');
      const downloadUrl = `https://addons.opera.com/extensions/download/${slug}/`;
      const res = await fetch(downloadUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/114.0.0.0'
        }
      });
      if (!res.ok) {
        throw new Error(`Opera Add-ons vrátil chybu HTTP ${res.status}`);
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      return await this.installFromBuffer(buffer, `${slug}.crx`, 'opera');
    }

    if (store === 'firefox') {
      let xpiUrl = '';
      let addonName = title || idOrSlug;

      if (idOrSlug.startsWith('http://') || idOrSlug.startsWith('https://')) {
        xpiUrl = idOrSlug;
      } else {
        const slug = idOrSlug.replace(/[^a-zA-Z0-9_-]/g, '');
        const apiUrl = `https://addons.mozilla.org/api/v5/addons/addon/${slug}/`;
        const apiRes = await fetch(apiUrl, {
          headers: { 'Accept': 'application/json' }
        });
        if (!apiRes.ok) {
          throw new Error(`Mozilla AMO API vrátilo chybu HTTP ${apiRes.status}`);
        }
        const data = await apiRes.json();
        addonName = data.name?.cs || data.name?.['en-US'] || (typeof data.name === 'string' ? data.name : slug);
        xpiUrl = data.current_version?.file?.url;
        if (!xpiUrl) {
          throw new Error('Mozilla AMO neposkytlo platný odkaz na stažení .xpi souboru.');
        }
      }

      const xpiRes = await fetch(xpiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0'
        }
      });
      if (!xpiRes.ok) {
        throw new Error(`Chyba při stahování XPI souboru: HTTP ${xpiRes.status}`);
      }
      const buffer = Buffer.from(await xpiRes.arrayBuffer());
      return await this.installFromBuffer(buffer, `${addonName}.xpi`, 'firefox');
    }

    throw new Error(`Neznámý store: ${store}`);
  }

  /**
   * Install extension from a folder, .crx, .zip, or .xpi file.
   */
  async installFromFile(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error('Soubor doplňku neexistuje: ' + filePath);
    }

    const ext = path.extname(filePath).toLowerCase();
    const isZip = ext === '.zip' || ext === '.crx' || ext === '.xpi';

    if (isZip) {
      const buffer = fs.readFileSync(filePath);
      const res = await this.installFromBuffer(buffer, path.basename(filePath), ext === '.xpi' ? 'firefox' : 'chrome');
      return res.extension;
    } else if (fs.statSync(filePath).isDirectory()) {
      const tempExtId = 'ext_' + Date.now();
      const targetDir = path.join(this.extensionsDir, tempExtId);
      fs.mkdirSync(targetDir, { recursive: true });
      this.copyDirRecursive(filePath, targetDir);

      const manifestPath = path.join(targetDir, 'manifest.json');
      if (!fs.existsSync(manifestPath)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
        throw new Error('V doplňku chybí soubor manifest.json.');
      }

      let manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (manifest.browser_specific_settings || manifest.applications) {
        manifest = this.adaptFirefoxManifest(manifest, targetDir);
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
      }

      const loaded = await this.loadExt(targetDir, { allowFileAccess: true });
      const finalId = loaded.id || tempExtId;
      const record = {
        id: finalId,
        name: manifest.name || path.basename(filePath),
        version: manifest.version || '1.0.0',
        description: manifest.description || '',
        manifestVersion: manifest.manifest_version || 2,
        source: 'chrome',
        path: targetDir,
        enabled: true,
        homepageUrl: manifest.homepage_url || '',
        icons: manifest.icons || {}
      };
      this.installedExtensions[finalId] = record;
      this.saveRegistry();
      return record;
    } else {
      throw new Error('Nepodporovaný formát doplňku. Podporovány jsou .crx, .zip, .xpi a složky.');
    }
  }

  adaptFirefoxManifest(manifest, targetDir) {
    const polyfillDest = path.join(targetDir, 'browser-polyfill-injected.js');
    if (fs.existsSync(this.compatPolyfillPath)) {
      fs.copyFileSync(this.compatPolyfillPath, polyfillDest);
    }

    const m = { ...manifest };

    // Remove Gecko-specific keys
    delete m.browser_specific_settings;
    delete m.applications;

    // Ensure manifest_version is compatible (2 or 3)
    if (!m.manifest_version) {
      m.manifest_version = 2;
    }

    // Inject polyfill into background scripts
    if (m.background) {
      if (m.background.scripts && Array.isArray(m.background.scripts)) {
        if (!m.background.scripts.includes('browser-polyfill-injected.js')) {
          m.background.scripts.unshift('browser-polyfill-injected.js');
        }
      } else if (m.background.service_worker) {
        // MV3 service worker
        const swPath = path.join(targetDir, m.background.service_worker);
        if (fs.existsSync(swPath)) {
          const swCode = fs.readFileSync(swPath, 'utf8');
          fs.writeFileSync(swPath, `importScripts('./browser-polyfill-injected.js');\n` + swCode, 'utf8');
        }
      }
    }

    // Inject polyfill into content scripts
    if (m.content_scripts && Array.isArray(m.content_scripts)) {
      for (const cs of m.content_scripts) {
        if (cs.js && Array.isArray(cs.js)) {
          if (!cs.js.includes('browser-polyfill-injected.js')) {
            cs.js.unshift('browser-polyfill-injected.js');
          }
        }
      }
    }

    return m;
  }

  async toggleExtension(id, enable) {
    const meta = this.installedExtensions[id];
    if (!meta) throw new Error('Doplněk nebyl nalezen.');

    if (enable) {
      meta.enabled = true;
      try {
        await this.loadExt(meta.path, { allowFileAccess: true });
      } catch (err) {
        console.error('[ExtensionManager] Error loading:', err);
      }
    } else {
      meta.enabled = false;
      try {
        await this.removeExt(id);
      } catch (err) {
        console.error('[ExtensionManager] Error unloading:', err);
      }
    }
    this.saveRegistry();
    return meta;
  }

  async removeExtension(id) {
    const meta = this.installedExtensions[id];
    if (!meta) return;

    if (meta.isBuiltin) {
      throw new Error('Integrovaný doplněk nelze odstranit. Můžete jej pouze vypnout.');
    }

    try {
      await this.removeExt(id);
    } catch (e) {
      // Ignore if not loaded
    }

    if (fs.existsSync(meta.path)) {
      try {
        fs.rmSync(meta.path, { recursive: true, force: true });
      } catch (e) {
        console.error('[ExtensionManager] Error deleting files:', e);
      }
    }

    delete this.installedExtensions[id];
    this.saveRegistry();
    return true;
  }

  copyDirRecursive(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        this.copyDirRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  getAll() {
    return Object.values(this.installedExtensions);
  }
}

module.exports = new ExtensionManager();
