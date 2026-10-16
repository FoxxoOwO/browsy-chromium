const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { app, session, dialog } = require('electron');

class ExtensionManager {
  constructor() {
    this.userDataPath = app.getPath('userData');
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
      }
    }
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
    const isFirefox = ext === '.xpi';

    const tempExtId = 'ext_' + Date.now();
    const targetDir = path.join(this.extensionsDir, tempExtId);
    fs.mkdirSync(targetDir, { recursive: true });

    if (isZip) {
      const zip = new AdmZip(filePath);
      zip.extractAllTo(targetDir, true);
    } else if (fs.statSync(filePath).isDirectory()) {
      this.copyDirRecursive(filePath, targetDir);
    } else {
      throw new Error('Nepodporovaný formát doplňku. Podporovány jsou .crx, .zip, .xpi a složky.');
    }

    // Inspect and transpile manifest if necessary
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
        name: manifest.name || path.basename(filePath),
        version: manifest.version || '1.0.0',
        description: manifest.description || '',
        manifestVersion: manifest.manifest_version || 2,
        source: isFirefox ? 'firefox' : 'chrome',
        path: targetDir,
        enabled: true,
        homepageUrl: manifest.homepage_url || '',
        icons: manifest.icons || {}
      };

      this.installedExtensions[finalId] = record;
      this.saveRegistry();
      return record;
    } catch (err) {
      fs.rmSync(targetDir, { recursive: true, force: true });
      throw new Error('Chyba při načítání doplňku do Chromia: ' + err.message);
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
