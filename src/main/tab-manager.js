const path = require('path');
const { WebContentsView, ipcMain } = require('electron');
const popupBlocker = require('./popup-blocker');
const videoDownloader = require('./video-downloader');
const adBlocker = require('./adblocker');
const textExpander = require('./text-expander');
const extensionManager = require('./extension-manager');
const settingsManager = require('./settings');

class TabManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.tabs = new Map(); // tabId -> TabRecord
    this.tabOrder = []; // array of tabIds
    this.activeTabId = null;
    this.nextId = 1;
    this.contentPreloadPath = path.join(__dirname, '../../content-preload.js');
    this.contentBounds = { x: 0, y: 78, width: 1200, height: 722 };
    this.activeWorkspaceId = settingsManager.get('activeWorkspaceId', 'ws_default');

    this.setupIPC();
  }

  setupIPC() {
    ipcMain.on('browsy:video-detected', (event, mediaInfo) => {
      const senderWebContents = event.sender;
      videoDownloader.registerMedia(senderWebContents.id, mediaInfo);
    });

    ipcMain.handle('browsy:get-expander-config', () => {
      return {
        enabled: textExpander.isEnabled(),
        snippets: textExpander.getSnippets()
      };
    });
  }

  setContentBounds(bounds) {
    this.contentBounds = bounds;
    const activeTab = this.getActiveTab();
    if (activeTab && activeTab.view) {
      activeTab.view.setBounds(this.contentBounds);
    }
  }

  setViewVisibility(visible) {
    const activeTab = this.getActiveTab();
    if (activeTab && activeTab.view) {
      activeTab.view.setVisible(visible);
    }
  }

  getActiveTab() {
    return this.tabs.get(this.activeTabId) || null;
  }

  createTab(initialUrl = 'browsy://newtab', options = {}) {
    const tabId = 'tab_' + this.nextId++;

    const view = new WebContentsView({
      webPreferences: {
        preload: this.contentPreloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        plugins: true,
        webSecurity: true
      }
    });

    const tabRecord = {
      id: tabId,
      url: initialUrl,
      title: 'Nová záložka',
      favicon: '',
      isLoading: true,
      canGoBack: false,
      canGoForward: false,
      isAudioPlaying: false,
      isMuted: false,
      isPinned: !!options.pinned,
      workspaceId: options.workspaceId || this.activeWorkspaceId,
      storeInfo: extensionManager.detectStoreUrl(initialUrl),
      view: view,
      webContentsId: view.webContents.id
    };

    this.tabs.set(tabId, tabRecord);
    this.tabOrder.push(tabId);

    // Attach security & blockers (route allowed popups/window.open directly into new tabs)
    popupBlocker.attachToWebContents(view.webContents, (url) => {
      this.createTab(url);
    });

    // Event listeners on tab's webContents
    view.webContents.on('did-start-loading', () => {
      tabRecord.isLoading = true;
      this.notifyTabUpdated(tabRecord);
    });

    view.webContents.on('did-stop-loading', () => {
      tabRecord.isLoading = false;
      const history = view.webContents.navigationHistory;
      tabRecord.canGoBack = history ? history.canGoBack() : view.webContents.canGoBack();
      tabRecord.canGoForward = history ? history.canGoForward() : view.webContents.canGoForward();
      tabRecord.url = view.webContents.getURL();
      tabRecord.storeInfo = extensionManager.detectStoreUrl(tabRecord.url);
      this.notifyTabUpdated(tabRecord);
    });

    view.webContents.on('page-title-updated', (event, title) => {
      tabRecord.title = title || 'Nová záložka';
      this.notifyTabUpdated(tabRecord);
    });

    view.webContents.on('page-favicon-updated', (event, favicons) => {
      if (favicons && favicons.length > 0) {
        tabRecord.favicon = favicons[0];
        this.notifyTabUpdated(tabRecord);
      }
    });

    view.webContents.on('media-started-playing', () => {
      tabRecord.isAudioPlaying = true;
      this.notifyTabUpdated(tabRecord);
    });

    view.webContents.on('media-paused', () => {
      tabRecord.isAudioPlaying = false;
      this.notifyTabUpdated(tabRecord);
    });

    // Navigate to initial URL
    this.navigateTab(tabId, initialUrl);

    // Switch to new tab if requested or if first tab
    if (options.activate !== false || this.tabs.size === 1) {
      this.switchTab(tabId);
    }

    this.notifyTabsListChanged();
    return tabRecord;
  }

  switchTab(tabId) {
    if (!this.tabs.has(tabId)) return;
    if (this.activeTabId === tabId) return;

    const oldTab = this.getActiveTab();
    if (oldTab && oldTab.view) {
      try {
        this.mainWindow.contentView.removeChildView(oldTab.view);
      } catch (e) {
        // Safe remove
      }
    }

    this.activeTabId = tabId;
    const newTab = this.tabs.get(tabId);

    if (newTab && newTab.view) {
      this.mainWindow.contentView.addChildView(newTab.view);
      newTab.view.setBounds(this.contentBounds);
      newTab.view.webContents.focus();
    }

    this.notifyActiveTabChanged(newTab);
  }

  closeTab(tabId) {
    if (!this.tabs.has(tabId)) return;

    const tab = this.tabs.get(tabId);
    const wasActive = this.activeTabId === tabId;
    const index = this.tabOrder.indexOf(tabId);

    // Remove view from window
    if (wasActive && tab.view) {
      try {
        this.mainWindow.contentView.removeChildView(tab.view);
      } catch (e) {}
    }

    // Clean up blockers & trackers for tab
    adBlocker.resetTabStats(tab.webContentsId);
    popupBlocker.clearTab(tab.webContentsId);
    videoDownloader.clearTab(tab.webContentsId);

    // Destroy webContents
    try {
      tab.view.webContents.close();
    } catch (e) {}

    this.tabs.delete(tabId);
    if (index >= 0) {
      this.tabOrder.splice(index, 1);
    }

    // If no tabs left at all, open new tab
    if (this.tabs.size === 0) {
      this.createTab('browsy://newtab', { workspaceId: this.activeWorkspaceId });
      return;
    }

    // If active tab closed, switch to adjacent tab in the same workspace
    if (wasActive) {
      const sameWsTabs = this.tabOrder.filter(id => {
        const t = this.tabs.get(id);
        return t && t.workspaceId === this.activeWorkspaceId;
      });

      if (sameWsTabs.length > 0) {
        this.switchTab(sameWsTabs[0]);
      } else {
        this.createTab('browsy://newtab', { workspaceId: this.activeWorkspaceId });
      }
    }

    this.notifyTabsListChanged();
  }

  navigateTab(tabId, inputUrl) {
    const tab = this.tabs.get(tabId);
    if (!tab) return;

    let targetUrl = inputUrl.trim();

    if (targetUrl === 'browsy://newtab' || targetUrl === 'about:blank' || targetUrl === '') {
      const newTabFile = path.join(__dirname, '../ui/newtab.html');
      tab.url = 'browsy://newtab';
      tab.view.webContents.loadFile(newTabFile);
      return;
    }

    if (targetUrl === 'browsy://extensions') {
      const extFile = path.join(__dirname, '../ui/extensions.html');
      tab.url = 'browsy://extensions';
      tab.view.webContents.loadFile(extFile);
      return;
    }

    if (targetUrl === 'browsy://settings') {
      const settingsFile = path.join(__dirname, '../ui/settings.html');
      tab.url = 'browsy://settings';
      tab.view.webContents.loadFile(settingsFile);
      return;
    }

    // Check if input looks like a valid URL or a search query
    const hasScheme = /^[a-zA-Z]+:\/\//.test(targetUrl);
    const isDomain = /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(:\d+)?(\/.*)?$/.test(targetUrl);

    if (hasScheme) {
      // standard URL
    } else if (isDomain) {
      targetUrl = 'https://' + targetUrl;
    } else {
      // Search query using configured engine
      const engine = settingsManager.get('defaultSearchEngine', 'google');
      const engines = {
        google: 'https://www.google.com/search?q=',
        duckduckgo: 'https://duckduckgo.com/?q=',
        bing: 'https://www.bing.com/search?q=',
        brave: 'https://search.brave.com/search?q='
      };
      const searchBase = engines[engine] || engines.google;
      targetUrl = searchBase + encodeURIComponent(targetUrl);
    }

    tab.url = targetUrl;
    tab.view.webContents.loadURL(targetUrl).catch((err) => {
      console.warn(`[TabManager] Error loading ${targetUrl}:`, err.message);
    });
  }

  reloadTab(tabId) {
    const tab = this.tabs.get(tabId);
    if (tab && tab.view) {
      tab.view.webContents.reload();
    }
  }

  goBack(tabId) {
    const tab = this.tabs.get(tabId);
    if (tab && tab.view) {
      const history = tab.view.webContents.navigationHistory;
      if (history ? history.canGoBack() : tab.view.webContents.canGoBack()) {
        if (history && history.goBack) history.goBack();
        else tab.view.webContents.goBack();
      }
    }
  }

  goForward(tabId) {
    const tab = this.tabs.get(tabId);
    if (tab && tab.view) {
      const history = tab.view.webContents.navigationHistory;
      if (history ? history.canGoForward() : tab.view.webContents.canGoForward()) {
        if (history && history.goForward) history.goForward();
        else tab.view.webContents.goForward();
      }
    }
  }

  toggleMuteTab(tabId) {
    const tab = this.tabs.get(tabId);
    if (tab && tab.view) {
      const current = tab.view.webContents.isAudioMuted();
      tab.view.webContents.setAudioMuted(!current);
      tab.isMuted = !current;
      this.notifyTabUpdated(tab);
    }
  }

  duplicateTab(tabId) {
    const tab = this.tabs.get(tabId);
    if (tab) {
      this.createTab(tab.url);
    }
  }

  togglePinTab(tabId) {
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.isPinned = !tab.isPinned;
      this.notifyTabUpdated(tab);
      this.notifyTabsListChanged();
    }
  }

  notifyTabUpdated(tab) {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    this.mainWindow.webContents.send('browsy:tab-updated', {
      id: tab.id,
      url: tab.url,
      title: tab.title,
      favicon: tab.favicon,
      isLoading: tab.isLoading,
      canGoBack: tab.canGoBack,
      canGoForward: tab.canGoForward,
      isAudioPlaying: tab.isAudioPlaying,
      isMuted: tab.isMuted,
      isPinned: tab.isPinned,
      storeInfo: tab.storeInfo || { isStore: false }
    });
  }

  notifyActiveTabChanged(tab) {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    this.mainWindow.webContents.send('browsy:active-tab-changed', {
      id: tab.id,
      url: tab.url,
      title: tab.title,
      canGoBack: tab.canGoBack,
      canGoForward: tab.canGoForward,
      isLoading: tab.isLoading,
      isMuted: tab.isMuted,
      storeInfo: tab.storeInfo || { isStore: false },
      blockedAds: adBlocker.getStatsForTab(tab.webContentsId),
      blockedPopups: popupBlocker.getBlockedPopups(tab.webContentsId),
      detectedMedia: videoDownloader.getMediaForTab(tab.webContentsId)
    });
  }

  notifyTabsListChanged() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    const list = this.getTabsList();
    this.mainWindow.webContents.send('browsy:tabs-list-updated', {
      tabs: list,
      activeTabId: this.activeTabId,
      activeWorkspaceId: this.activeWorkspaceId,
      workspaces: this.getWorkspaces()
    });
  }

  getTabsList() {
    return this.tabOrder.map(id => {
      const t = this.tabs.get(id);
      return {
        id: t.id,
        url: t.url,
        title: t.title,
        favicon: t.favicon,
        isLoading: t.isLoading,
        isAudioPlaying: t.isAudioPlaying,
        isMuted: t.isMuted,
        isPinned: t.isPinned,
        workspaceId: t.workspaceId
      };
    });
  }

  notifyWorkspaceChanged() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    this.mainWindow.webContents.send('browsy:workspace-changed', {
      activeWorkspaceId: this.activeWorkspaceId,
      workspaces: this.getWorkspaces()
    });
  }

  switchWorkspace(workspaceId) {
    const workspaces = this.getWorkspaces();
    if (!workspaces.some(w => w.id === workspaceId)) return;

    this.activeWorkspaceId = workspaceId;
    settingsManager.set('activeWorkspaceId', workspaceId);

    // Find tabs in this workspace
    const wsTabs = this.tabOrder.filter(id => {
      const t = this.tabs.get(id);
      return t && t.workspaceId === workspaceId;
    });

    if (wsTabs.length > 0) {
      this.switchTab(wsTabs[0]);
    } else {
      this.createTab('browsy://newtab', { workspaceId });
    }

    this.notifyTabsListChanged();
    this.notifyWorkspaceChanged();
  }

  moveTabToWorkspace(tabId, targetWorkspaceId) {
    const tab = this.tabs.get(tabId);
    if (!tab) return;
    tab.workspaceId = targetWorkspaceId;

    if (this.activeTabId === tabId) {
      const remaining = this.tabOrder.filter(id => {
        const t = this.tabs.get(id);
        return t && t.workspaceId === this.activeWorkspaceId;
      });
      if (remaining.length > 0) {
        this.switchTab(remaining[0]);
      } else {
        this.createTab('browsy://newtab', { workspaceId: this.activeWorkspaceId });
      }
    }
    this.notifyTabsListChanged();
  }

  getWorkspaces() {
    return settingsManager.get('workspaces', [
      { id: 'ws_default', name: 'Osobní', icon: '👤', color: '#6366f1' },
      { id: 'ws_work', name: 'Práce', icon: '💼', color: '#10b981' },
      { id: 'ws_dev', name: 'Vývoj', icon: '⚡', color: '#f59e0b' }
    ]);
  }

  createWorkspace(name, icon = '📁', color = '#6366f1') {
    const list = [...this.getWorkspaces()];
    const newWs = {
      id: 'ws_' + Date.now(),
      name: name.trim() || 'Nový prostor',
      icon: icon || '📁',
      color: color || '#6366f1'
    };
    list.push(newWs);
    settingsManager.set('workspaces', list);
    this.notifyWorkspaceChanged();
    this.notifyTabsListChanged();
    return newWs;
  }

  updateWorkspace(id, data) {
    let list = [...this.getWorkspaces()];
    const idx = list.findIndex(w => w.id === id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...data };
      settingsManager.set('workspaces', list);
      this.notifyWorkspaceChanged();
      this.notifyTabsListChanged();
      return list[idx];
    }
    throw new Error('Pracovní prostor nebyl nalezen.');
  }

  deleteWorkspace(id) {
    let list = [...this.getWorkspaces()];
    if (list.length <= 1) {
      throw new Error('Nelze smazat jediný existující pracovní prostor.');
    }
    list = list.filter(w => w.id !== id);
    settingsManager.set('workspaces', list);

    // Reassign tabs from deleted workspace to the first remaining workspace
    const fallbackWsId = list[0].id;
    for (const tab of this.tabs.values()) {
      if (tab.workspaceId === id) {
        tab.workspaceId = fallbackWsId;
      }
    }

    if (this.activeWorkspaceId === id) {
      this.switchWorkspace(fallbackWsId);
    } else {
      this.notifyTabsListChanged();
      this.notifyWorkspaceChanged();
    }
    return true;
  }
}

module.exports = TabManager;
