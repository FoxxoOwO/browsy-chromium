const fs = require('fs');
const path = require('path');
const { dialog } = require('electron');
const settingsManager = require('./settings');
const adBlocker = require('./adblocker');
const textExpander = require('./text-expander');

class ProfileSync {
  async exportProfile(targetPath = null, browserWindow = null) {
    let savePath = targetPath;
    if (!savePath) {
      const res = await dialog.showSaveDialog(browserWindow, {
        title: 'Exportovat profil Browsy',
        defaultPath: 'browsy-profile-backup.json',
        filters: [{ name: 'JSON Backup', extensions: ['json'] }]
      });
      if (res.canceled || !res.filePath) {
        return { success: false, canceled: true };
      }
      savePath = res.filePath;
    }

    const payload = {
      version: 1,
      appName: 'Browsy Chromium',
      exportedAt: new Date().toISOString(),
      settings: settingsManager.getAll(),
      customFilters: adBlocker.getCustomFilters ? adBlocker.getCustomFilters() : [],
      textExpanderSnippets: textExpander.getSnippets ? textExpander.getSnippets() : []
    };

    fs.writeFileSync(savePath, JSON.stringify(payload, null, 2), 'utf8');
    return {
      success: true,
      filePath: savePath,
      settingsCount: Object.keys(payload.settings).length,
      filtersCount: payload.customFilters.length,
      snippetsCount: payload.textExpanderSnippets.length
    };
  }

  async importProfile(sourcePath = null, browserWindow = null) {
    let filePath = sourcePath;
    if (!filePath) {
      const res = await dialog.showOpenDialog(browserWindow, {
        title: 'Importovat profil Browsy',
        filters: [{ name: 'JSON Backup', extensions: ['json'] }],
        properties: ['openFile']
      });
      if (res.canceled || !res.filePaths || res.filePaths.length === 0) {
        return { success: false, canceled: true };
      }
      filePath = res.filePaths[0];
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Neplatný formát záložního souboru');
    }

    // 1. Restore settings
    if (parsed.settings && typeof parsed.settings === 'object') {
      settingsManager.update(parsed.settings);
    }

    // 2. Restore custom adblock filters
    if (Array.isArray(parsed.customFilters) && adBlocker.setCustomFilters) {
      adBlocker.setCustomFilters(parsed.customFilters);
    }

    // 3. Restore text expander snippets
    if (Array.isArray(parsed.textExpanderSnippets)) {
      settingsManager.set('textExpanderSnippets', parsed.textExpanderSnippets);
    }

    settingsManager.flush();

    return {
      success: true,
      filePath: filePath,
      settingsCount: parsed.settings ? Object.keys(parsed.settings).length : 0,
      filtersCount: parsed.customFilters ? parsed.customFilters.length : 0,
      snippetsCount: parsed.textExpanderSnippets ? parsed.textExpanderSnippets.length : 0
    };
  }
}

module.exports = new ProfileSync();
