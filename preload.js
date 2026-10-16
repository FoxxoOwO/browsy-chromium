const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('browsyAPI', {
  // Tabs
  createTab: (url) => ipcRenderer.invoke('tabs:create', url),
  switchTab: (tabId) => ipcRenderer.invoke('tabs:switch', tabId),
  closeTab: (tabId) => ipcRenderer.invoke('tabs:close', tabId),
  navigate: (tabId, url) => ipcRenderer.invoke('tabs:navigate', tabId, url),
  reload: (tabId) => ipcRenderer.invoke('tabs:reload', tabId),
  goBack: (tabId) => ipcRenderer.invoke('tabs:go-back', tabId),
  goForward: (tabId) => ipcRenderer.invoke('tabs:go-forward', tabId),
  toggleMute: (tabId) => ipcRenderer.invoke('tabs:toggle-mute', tabId),
  duplicateTab: (tabId) => ipcRenderer.invoke('tabs:duplicate', tabId),
  togglePinTab: (tabId) => ipcRenderer.invoke('tabs:toggle-pin', tabId),
  getTabs: () => ipcRenderer.invoke('tabs:get-list'),

  // Workspaces (Zen Browser style)
  getWorkspaces: () => ipcRenderer.invoke('workspaces:get-all'),
  getActiveWorkspace: () => ipcRenderer.invoke('workspaces:get-active'),
  switchWorkspace: (id) => ipcRenderer.invoke('workspaces:switch', id),
  createWorkspace: (name, icon, color) => ipcRenderer.invoke('workspaces:create', name, icon, color),
  updateWorkspace: (id, data) => ipcRenderer.invoke('workspaces:update', id, data),
  deleteWorkspace: (id) => ipcRenderer.invoke('workspaces:delete', id),
  moveTabToWorkspace: (tabId, targetWsId) => ipcRenderer.invoke('workspaces:move-tab', tabId, targetWsId),
  onWorkspaceChanged: (cb) => {
    const sub = (e, data) => cb(data);
    ipcRenderer.on('browsy:workspace-changed', sub);
    return () => ipcRenderer.removeListener('browsy:workspace-changed', sub);
  },

  // Layout & Bounds
  updateContentBounds: (bounds) => ipcRenderer.invoke('layout:update-bounds', bounds),
  setLayoutMode: (mode) => ipcRenderer.invoke('layout:set-mode', mode),
  setViewVisibility: (visible) => ipcRenderer.invoke('layout:set-view-visibility', visible),

  // Shields & Adblocker
  getShieldsInfo: () => ipcRenderer.invoke('shields:get-info'),
  toggleShields: (enabled) => ipcRenderer.invoke('shields:toggle-enabled', enabled),
  toggleShieldsWhitelist: (hostname) => ipcRenderer.invoke('shields:toggle-whitelist', hostname),

  // Popups
  getPopupInfo: () => ipcRenderer.invoke('popup:get-info'),
  togglePopupBlocker: (enabled) => ipcRenderer.invoke('popup:toggle-enabled', enabled),
  togglePopupWhitelist: (hostname) => ipcRenderer.invoke('popup:toggle-whitelist', hostname),

  // Video Downloader
  getVideoMedia: (tabId) => ipcRenderer.invoke('video:get-media', tabId),
  downloadVideo: (url) => ipcRenderer.invoke('video:download', url),
  getActiveDownloads: () => ipcRenderer.invoke('video:get-downloads'),

  // Text Expander
  getSnippets: () => ipcRenderer.invoke('expander:get-snippets'),
  addSnippet: (trigger, replacement, label) => ipcRenderer.invoke('expander:add-snippet', trigger, replacement, label),
  updateSnippet: (id, trigger, replacement, label) => ipcRenderer.invoke('expander:update-snippet', id, trigger, replacement, label),
  deleteSnippet: (id) => ipcRenderer.invoke('expander:delete-snippet', id),
  toggleExpander: (enabled) => ipcRenderer.invoke('expander:toggle-enabled', enabled),

  // Extensions (Chrome MV2/MV3 & Firefox)
  getExtensions: () => ipcRenderer.invoke('extensions:get-all'),
  pickAndInstallExtension: () => ipcRenderer.invoke('extensions:pick-install'),
  installFromStore: (store, idOrSlug, title) => ipcRenderer.invoke('extensions:install-from-store', store, idOrSlug, title),
  detectStoreUrl: (url) => ipcRenderer.invoke('extensions:detect-store-url', url),
  toggleExtension: (id, enabled) => ipcRenderer.invoke('extensions:toggle', id, enabled),
  removeExtension: (id) => ipcRenderer.invoke('extensions:remove', id),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get-all'),
  setSetting: (key, val) => ipcRenderer.invoke('settings:set', key, val),

  // Events from Main Process
  onTabUpdated: (cb) => {
    const sub = (e, data) => cb(data);
    ipcRenderer.on('browsy:tab-updated', sub);
    return () => ipcRenderer.removeListener('browsy:tab-updated', sub);
  },
  onActiveTabChanged: (cb) => {
    const sub = (e, data) => cb(data);
    ipcRenderer.on('browsy:active-tab-changed', sub);
    return () => ipcRenderer.removeListener('browsy:active-tab-changed', sub);
  },
  onTabsListUpdated: (cb) => {
    const sub = (e, data) => cb(data);
    ipcRenderer.on('browsy:tabs-list-updated', sub);
    return () => ipcRenderer.removeListener('browsy:tabs-list-updated', sub);
  },
  onPopupBlocked: (cb) => {
    const sub = (e, data) => cb(data);
    ipcRenderer.on('browsy:popup-blocked', sub);
    return () => ipcRenderer.removeListener('browsy:popup-blocked', sub);
  },
  onMediaDetected: (cb) => {
    const sub = (e, data) => cb(data);
    ipcRenderer.on('browsy:media-detected', sub);
    return () => ipcRenderer.removeListener('browsy:media-detected', sub);
  },
  onDownloadProgress: (cb) => {
    const sub = (e, data) => cb(data);
    ipcRenderer.on('browsy:download-progress', sub);
    return () => ipcRenderer.removeListener('browsy:download-progress', sub);
  }
});
