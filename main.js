const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');

const settingsManager = require('./src/main/settings');
const extensionManager = require('./src/main/extension-manager');
const adBlocker = require('./src/main/adblocker');
const popupBlocker = require('./src/main/popup-blocker');
const videoDownloader = require('./src/main/video-downloader');
const textExpander = require('./src/main/text-expander');
const TabManager = require('./src/main/tab-manager');

let mainWindow = null;
let tabManager = null;

// Allow self-signed or test protocols if needed
app.commandLine.appendSwitch('ignore-certificate-errors', 'false');
// Enable widevine / extensions
app.commandLine.appendSwitch('enable-experimental-web-platform-features');

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 800,
    minHeight: 500,
    title: 'Browsy Chromium',
    backgroundColor: '#121216',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  // Remove native default menu for sleek browser UI
  mainWindow.setMenuBarVisibility(false);

  // Initialize Tab Manager
  tabManager = new TabManager(mainWindow);

  // Wire popup blocker notifications to UI
  popupBlocker.setCallback((tabId, record, count) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('browsy:popup-blocked', { tabId, record, count });
    }
  });

  // Wire video downloader notifications to UI
  videoDownloader.setCallbacks(
    (tabId, item, count) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('browsy:media-detected', { tabId, item, count });
      }
    },
    (dlRecord) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('browsy:download-progress', dlRecord);
      }
    }
  );

  // Load the browser chrome UI (Svelte 5 modern build or fallback)
  const svelteDist = path.join(__dirname, 'dist-ui/index.html');
  const uiPath = fs.existsSync(svelteDist) ? svelteDist : path.join(__dirname, 'src/ui/index.html');
  console.log(`[Browsy] Loading UI from: ${uiPath}`);
  await mainWindow.loadFile(uiPath);

  // Open first tab with newtab
  tabManager.createTab('browsy://newtab');

  // Handle window resize
  mainWindow.on('resize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('browsy:window-resized');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (process.env.BROWSY_TEST_EXIT) {
    console.log('[Browsy Test] Window & tabs launched cleanly. Exiting due to BROWSY_TEST_EXIT.');
    setTimeout(() => {
      app.quit();
    }, 1500);
  }
}

// -------------------------------------------------------------
// Setup IPC Handlers
// -------------------------------------------------------------
function setupIPC() {
  // Tabs
  ipcMain.handle('tabs:create', (e, url) => tabManager.createTab(url));
  ipcMain.handle('tabs:switch', (e, tabId) => tabManager.switchTab(tabId));
  ipcMain.handle('tabs:close', (e, tabId) => tabManager.closeTab(tabId));
  ipcMain.handle('tabs:navigate', (e, tabId, url) => tabManager.navigateTab(tabId, url));
  ipcMain.handle('tabs:reload', (e, tabId) => tabManager.reloadTab(tabId));
  ipcMain.handle('tabs:go-back', (e, tabId) => tabManager.goBack(tabId));
  ipcMain.handle('tabs:go-forward', (e, tabId) => tabManager.goForward(tabId));
  ipcMain.handle('tabs:toggle-mute', (e, tabId) => tabManager.toggleMuteTab(tabId));
  ipcMain.handle('tabs:duplicate', (e, tabId) => tabManager.duplicateTab(tabId));
  ipcMain.handle('tabs:toggle-pin', (e, tabId) => tabManager.togglePinTab(tabId));
  ipcMain.handle('tabs:get-list', () => tabManager.getTabsList());

  // Workspaces (Zen Browser style)
  ipcMain.handle('workspaces:get-all', () => tabManager.getWorkspaces());
  ipcMain.handle('workspaces:get-active', () => tabManager.activeWorkspaceId);
  ipcMain.handle('workspaces:switch', (e, id) => tabManager.switchWorkspace(id));
  ipcMain.handle('workspaces:create', (e, name, icon, color) => tabManager.createWorkspace(name, icon, color));
  ipcMain.handle('workspaces:update', (e, id, data) => tabManager.updateWorkspace(id, data));
  ipcMain.handle('workspaces:delete', (e, id) => tabManager.deleteWorkspace(id));
  ipcMain.handle('workspaces:move-tab', (e, tabId, targetWsId) => tabManager.moveTabToWorkspace(tabId, targetWsId));

  // Layout & Bounds
  ipcMain.handle('layout:update-bounds', (e, bounds) => {
    if (tabManager) {
      tabManager.setContentBounds(bounds);
    }
    return true;
  });
  ipcMain.handle('layout:set-mode', (e, mode) => {
    settingsManager.set('tabLayout', mode);
    return mode;
  });
  ipcMain.handle('layout:set-view-visibility', (e, visible) => {
    if (tabManager) {
      tabManager.setViewVisibility(visible);
    }
    return true;
  });

  // Shields & Adblocker
  ipcMain.handle('shields:get-info', (e) => {
    const active = tabManager ? tabManager.getActiveTab() : null;
    const tabBlocked = active ? adBlocker.getStatsForTab(active.webContentsId) : 0;
    return {
      enabled: settingsManager.get('shieldsEnabled', true),
      totalBlocked: adBlocker.getTotalBlocked(),
      tabBlocked: tabBlocked,
      whitelist: settingsManager.get('shieldsWhitelist', [])
    };
  });
  ipcMain.handle('shields:toggle-enabled', (e, enabled) => {
    settingsManager.set('shieldsEnabled', enabled);
    return enabled;
  });
  ipcMain.handle('shields:toggle-whitelist', (e, hostname) => {
    return adBlocker.toggleWhitelist(hostname);
  });

  // Popups
  ipcMain.handle('popup:get-info', (e) => {
    const active = tabManager ? tabManager.getActiveTab() : null;
    const blocked = active ? popupBlocker.getBlockedPopups(active.webContentsId) : [];
    return {
      enabled: settingsManager.get('popupBlockerEnabled', true),
      blockedList: blocked,
      whitelist: settingsManager.get('popupWhitelist', [])
    };
  });
  ipcMain.handle('popup:toggle-enabled', (e, enabled) => {
    settingsManager.set('popupBlockerEnabled', enabled);
    return enabled;
  });
  ipcMain.handle('popup:toggle-whitelist', (e, hostname) => {
    return popupBlocker.toggleWhitelist(hostname);
  });

  // Video Downloader
  ipcMain.handle('video:get-media', (e, tabId) => {
    const active = tabManager ? tabManager.getActiveTab() : null;
    const id = tabId || (active ? active.webContentsId : null);
    return id ? videoDownloader.getMediaForTab(id) : [];
  });
  ipcMain.handle('video:download', (e, url) => {
    videoDownloader.startDownload(url);
    return true;
  });
  ipcMain.handle('video:get-downloads', () => {
    return videoDownloader.getActiveDownloads();
  });

  // Text Expander
  ipcMain.handle('expander:get-snippets', () => {
    return {
      enabled: textExpander.isEnabled(),
      snippets: textExpander.getSnippets()
    };
  });
  ipcMain.handle('expander:add-snippet', (e, trigger, replacement, label) => {
    return textExpander.addSnippet(trigger, replacement, label);
  });
  ipcMain.handle('expander:update-snippet', (e, id, trigger, replacement, label) => {
    return textExpander.updateSnippet(id, trigger, replacement, label);
  });
  ipcMain.handle('expander:delete-snippet', (e, id) => {
    return textExpander.deleteSnippet(id);
  });
  ipcMain.handle('expander:toggle-enabled', (e, enabled) => {
    return textExpander.setEnabled(enabled);
  });

  // Extensions
  ipcMain.handle('extensions:get-all', () => {
    return extensionManager.getAll();
  });
  ipcMain.handle('extensions:pick-install', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Vyberte doplněk k instalaci (Chrome / Firefox)',
      filters: [
        { name: 'Všechny podporované doplňky', extensions: ['crx', 'xpi', 'zip'] },
        { name: 'Firefox doplňky (.xpi)', extensions: ['xpi'] },
        { name: 'Chrome doplňky (.crx, .zip)', extensions: ['crx', 'zip'] }
      ],
      properties: ['openFile']
    });

    if (!result.canceled && result.filePaths.length > 0) {
      try {
        const ext = await extensionManager.installFromFile(result.filePaths[0]);
        return { success: true, extension: ext };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
    return { canceled: true };
  });
  ipcMain.handle('extensions:toggle', async (e, id, enabled) => {
    return await extensionManager.toggleExtension(id, enabled);
  });
  ipcMain.handle('extensions:remove', async (e, id) => {
    return await extensionManager.removeExtension(id);
  });
  ipcMain.handle('extensions:detect-store-url', (e, url) => {
    return extensionManager.detectStoreUrl(url);
  });
  ipcMain.handle('extensions:install-from-store', async (e, store, idOrSlug, title) => {
    try {
      const res = await extensionManager.installFromStore(store, idOrSlug, title);
      return res;
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Settings
  ipcMain.handle('settings:get-all', () => {
    return settingsManager.getAll();
  });
  ipcMain.handle('settings:set', (e, key, val) => {
    return settingsManager.set(key, val);
  });
}

// -------------------------------------------------------------
// App Lifecycle
// -------------------------------------------------------------
app.whenReady().then(async () => {
  // Initialize adblocker & video downloader
  adBlocker.init();
  videoDownloader.init();

  // Setup IPC
  setupIPC();

  // Initialize and load extensions (including built-in uBlock Origin)
  try {
    await extensionManager.initExtensions();
  } catch (err) {
    console.error('[Main] Extension init error:', err);
  }

  // Create main UI window
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
