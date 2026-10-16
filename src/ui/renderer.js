// =========================================================
// Browsy Chromium UI Controller (renderer.js)
// With Zen Browser-style Workspaces Support
// =========================================================

document.addEventListener('DOMContentLoaded', async () => {
  const api = window.browsyAPI;
  if (!api) {
    console.error('browsyAPI is not available');
    return;
  }

  // State
  let currentTabs = [];
  let activeTabId = null;
  let layoutMode = 'horizontal'; // 'horizontal' | 'vertical'
  let sidebarCollapsed = false;
  let currentDomain = '';
  let activePopover = null;

  // Workspaces State
  let workspaces = [];
  let activeWorkspaceId = 'ws_default';
  let selectedWsIcon = '📁';
  let selectedWsColor = '#6366f1';
  let contextTargetTab = null;

  // DOM Elements - Chrome & Navigation
  const body = document.body;
  const viewport = document.getElementById('web-view-viewport');
  const hTabsContainer = document.getElementById('horizontal-tabs-container');
  const vTabsContainer = document.getElementById('vertical-tabs-container');
  const hNewTabBtn = document.getElementById('h-new-tab-btn');
  const vNewTabBtn = document.getElementById('v-new-tab-btn');
  const btnBack = document.getElementById('btn-back');
  const btnForward = document.getElementById('btn-forward');
  const btnReload = document.getElementById('btn-reload');
  const btnHome = document.getElementById('btn-home');
  const omniboxInput = document.getElementById('omnibox-input');
  const badgePopup = document.getElementById('badge-popup-blocked');
  const popupBlockedCount = document.getElementById('popup-blocked-count');
  const badgeShields = document.getElementById('badge-shields');
  const shieldsBlockedCount = document.getElementById('shields-blocked-count');
  const btnVideoDownloader = document.getElementById('btn-video-downloader');
  const videoBadge = document.getElementById('video-badge');
  const btnTextExpander = document.getElementById('btn-text-expander');
  const btnExtensions = document.getElementById('btn-extensions');
  const btnToggleLayout = document.getElementById('btn-toggle-layout');
  const iconLayoutVert = document.getElementById('icon-layout-vertical');
  const iconLayoutHoriz = document.getElementById('icon-layout-horizontal');
  const btnSettings = document.getElementById('btn-settings');
  const verticalSidebar = document.getElementById('vertical-sidebar');
  const btnCollapseSidebar = document.getElementById('btn-collapse-sidebar');

  // DOM Elements - Workspaces
  const hWorkspacePill = document.getElementById('horizontal-workspace-pill');
  const hWsIcon = document.getElementById('h-ws-icon');
  const hWsName = document.getElementById('h-ws-name');
  const vWsPill = document.getElementById('v-ws-pill');
  const vWsIcon = document.getElementById('v-ws-icon');
  const vWsName = document.getElementById('v-ws-name');
  const zenWsList = document.getElementById('zen-ws-list');
  const btnCreateWs = document.getElementById('btn-create-ws');
  const zenWsDock = document.getElementById('zen-workspace-dock');

  // Popovers & Modals
  const popoverShields = document.getElementById('popover-shields');
  const popoverVideo = document.getElementById('popover-video');
  const popoverPopups = document.getElementById('popover-popups');
  const popoverExpander = document.getElementById('popover-expander');
  const popoverExtensions = document.getElementById('popover-extensions');
  const popoverWorkspaceMenu = document.getElementById('popover-workspace-menu');
  const workspaceItemsContainer = document.getElementById('workspace-items-container');
  const btnOpenCreateWsModal = document.getElementById('btn-open-create-ws-modal');
  const modalSettings = document.getElementById('modal-settings');

  // Workspace Create Modal
  const modalWorkspace = document.getElementById('modal-workspace');
  const btnCloseWsModal = document.getElementById('btn-close-ws-modal');
  const inputWsName = document.getElementById('input-ws-name');
  const wsIconPicker = document.getElementById('ws-icon-picker');
  const wsColorPicker = document.getElementById('ws-color-picker');
  const btnSaveWorkspace = document.getElementById('btn-save-workspace');

  // Tab Context Menu
  const tabContextMenu = document.getElementById('tab-context-menu');
  const ctxWorkspacesSubmenu = document.getElementById('ctx-workspaces-submenu');
  const ctxDuplicateTab = document.getElementById('ctx-duplicate-tab');
  const ctxPinTab = document.getElementById('ctx-pin-tab');
  const ctxMuteTab = document.getElementById('ctx-mute-tab');
  const ctxCloseTab = document.getElementById('ctx-close-tab');

  // -------------------------------------------------------------
  // Viewport Bounds Sync
  // -------------------------------------------------------------
  function syncViewportBounds() {
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    api.updateContentBounds({
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.max(100, Math.round(rect.width)),
      height: Math.max(100, Math.round(rect.height))
    });
  }

  window.addEventListener('resize', () => {
    syncViewportBounds();
  });

  // -------------------------------------------------------------
  // Layout Management (Horizontal / Vertical Tabs)
  // -------------------------------------------------------------
  async function applyLayout(mode) {
    layoutMode = mode;
    if (mode === 'vertical') {
      body.classList.remove('layout-horizontal');
      body.classList.add('layout-vertical');
      iconLayoutVert.classList.add('hidden');
      iconLayoutHoriz.classList.remove('hidden');
    } else {
      body.classList.remove('layout-vertical');
      body.classList.add('layout-horizontal');
      iconLayoutHoriz.classList.add('hidden');
      iconLayoutVert.classList.remove('hidden');
    }
    await api.setLayoutMode(mode);
    setTimeout(syncViewportBounds, 50);
  }

  btnToggleLayout.addEventListener('click', () => {
    const nextMode = layoutMode === 'horizontal' ? 'vertical' : 'horizontal';
    applyLayout(nextMode);
  });

  btnCollapseSidebar.addEventListener('click', () => {
    sidebarCollapsed = !sidebarCollapsed;
    verticalSidebar.classList.toggle('collapsed', sidebarCollapsed);
    setTimeout(syncViewportBounds, 50);
  });

  // -------------------------------------------------------------
  // Tabs Rendering (Filtered by Active Workspace)
  // -------------------------------------------------------------
  function renderTabs() {
    const visibleTabs = currentTabs.filter(t => !t.workspaceId || t.workspaceId === activeWorkspaceId);

    // Render Horizontal Tabs
    hTabsContainer.innerHTML = '';
    visibleTabs.forEach((tab) => {
      const tabEl = createTabElement(tab, 'h');
      hTabsContainer.appendChild(tabEl);
    });

    // Render Vertical Tabs
    vTabsContainer.innerHTML = '';
    visibleTabs.forEach((tab) => {
      const tabEl = createTabElement(tab, 'v');
      vTabsContainer.appendChild(tabEl);
    });

    updateWorkspacesUI();
  }

  function createTabElement(tab, type) {
    const el = document.createElement('div');
    const isActive = tab.id === activeTabId;
    el.className = (type === 'v' ? 'v-tab' : 'tab') + (isActive ? ' active' : '');
    el.dataset.id = tab.id;

    // Favicon
    const faviconContainer = document.createElement('div');
    faviconContainer.className = 'tab-favicon';
    if (tab.favicon) {
      const img = document.createElement('img');
      img.src = tab.favicon;
      img.onerror = () => { img.style.display = 'none'; faviconContainer.textContent = '🌐'; };
      faviconContainer.appendChild(img);
    } else {
      faviconContainer.textContent = tab.url && tab.url.startsWith('browsy://') ? '⚡' : '🌐';
    }
    el.appendChild(faviconContainer);

    // Title
    const titleEl = document.createElement('span');
    titleEl.className = 'tab-title';
    titleEl.textContent = tab.title || (tab.isLoading ? 'Načítání...' : 'Nová záložka');
    el.appendChild(titleEl);

    // Audio Mute Button
    if (tab.isAudioPlaying || tab.isMuted) {
      const audioBtn = document.createElement('button');
      audioBtn.className = 'tab-audio-btn';
      audioBtn.title = tab.isMuted ? 'Zrušit ztlumení' : 'Ztlumit zvuk';
      audioBtn.innerHTML = tab.isMuted ? '🔇' : '🔊';
      audioBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        api.toggleMute(tab.id);
      });
      el.appendChild(audioBtn);
    }

    // Close Button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close-btn';
    closeBtn.title = 'Zavřít záložku';
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      api.closeTab(tab.id);
    });
    el.appendChild(closeBtn);

    // Switch tab on click
    el.addEventListener('click', () => {
      if (tab.id !== activeTabId) {
        api.switchTab(tab.id);
      }
    });

    // Right-click context menu (Move to workspace, Pin, Mute, Duplicate)
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openTabContextMenu(e, tab);
    });

    return el;
  }

  hNewTabBtn.addEventListener('click', () => api.createTab('browsy://newtab', { workspaceId: activeWorkspaceId }));
  vNewTabBtn.addEventListener('click', () => api.createTab('browsy://newtab', { workspaceId: activeWorkspaceId }));

  // -------------------------------------------------------------
  // Zen Browser Workspaces Logic & UI
  // -------------------------------------------------------------
  function updateWorkspacesUI() {
    const activeWs = workspaces.find(w => w.id === activeWorkspaceId) || workspaces[0] || { id: 'ws_default', name: 'Osobní', icon: '👤', color: '#6366f1' };

    // Update horizontal pill
    if (hWsIcon) hWsIcon.textContent = activeWs.icon;
    if (hWsName) hWsName.textContent = activeWs.name;

    // Update vertical sidebar pill
    if (vWsIcon) vWsIcon.textContent = activeWs.icon;
    if (vWsName) vWsName.textContent = activeWs.name;

    // Render Zen Workspace Dock buttons at bottom of vertical sidebar
    if (zenWsList) {
      zenWsList.innerHTML = '';
      workspaces.forEach(ws => {
        const btn = document.createElement('button');
        const isActive = ws.id === activeWorkspaceId;
        btn.className = 'zen-ws-btn' + (isActive ? ' active' : '');
        btn.style.setProperty('--ws-color', ws.color || '#6366f1');
        btn.style.setProperty('--ws-glow', (ws.color || '#6366f1') + '66');
        btn.textContent = ws.icon || '📁';

        // Count tabs in this workspace
        const tabCount = currentTabs.filter(t => t.workspaceId === ws.id).length;
        btn.title = `${ws.name} (${tabCount} záložek)`;

        btn.addEventListener('click', () => {
          if (ws.id !== activeWorkspaceId) {
            api.switchWorkspace(ws.id);
          }
        });
        zenWsList.appendChild(btn);
      });
    }

    // Render workspace dropdown items in popover
    if (workspaceItemsContainer) {
      workspaceItemsContainer.innerHTML = '';
      workspaces.forEach(ws => {
        const row = document.createElement('div');
        const isActive = ws.id === activeWorkspaceId;
        row.className = 'ws-item-row' + (isActive ? ' active' : '');

        const tabCount = currentTabs.filter(t => t.workspaceId === ws.id).length;

        row.innerHTML = `
          <div class="ws-item-info">
            <span style="font-size: 18px;">${ws.icon}</span>
            <span style="font-weight: 600; color: ${ws.color || '#fff'}">${ws.name}</span>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="ws-item-badge">${tabCount} záložek</span>
            ${workspaces.length > 1 ? `<button class="tab-close-btn btn-del-ws" title="Smazat prostor">&times;</button>` : ''}
          </div>
        `;

        row.querySelector('.ws-item-info').addEventListener('click', () => {
          api.switchWorkspace(ws.id);
          closeAllPopovers();
        });

        const delBtn = row.querySelector('.btn-del-ws');
        if (delBtn) {
          delBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm(`Opravdu chcete smazat pracovní prostor "${ws.name}"? Všechny jeho záložky budou přesunuty.`)) {
              await api.deleteWorkspace(ws.id);
            }
          });
        }

        workspaceItemsContainer.appendChild(row);
      });
    }
  }

  // Workspace Pill Click Handlers
  if (hWorkspacePill) {
    hWorkspacePill.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePopover(popoverWorkspaceMenu);
    });
  }

  if (vWsPill) {
    vWsPill.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePopover(popoverWorkspaceMenu);
    });
  }

  // Mouse wheel cycling over Zen workspace dock
  if (zenWsDock) {
    zenWsDock.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (workspaces.length <= 1) return;
      const currentIdx = workspaces.findIndex(w => w.id === activeWorkspaceId);
      if (currentIdx < 0) return;

      let nextIdx = e.deltaY > 0 ? currentIdx + 1 : currentIdx - 1;
      if (nextIdx >= workspaces.length) nextIdx = 0;
      if (nextIdx < 0) nextIdx = workspaces.length - 1;

      api.switchWorkspace(workspaces[nextIdx].id);
    }, { passive: false });
  }

  // Create Workspace Modal
  const presetIcons = ['👤', '💼', '⚡', '🎓', '🎮', '🛍️', '🎨', '🎵', '🚀', '💻', '🏠', '📚', '🎬', '💡'];
  const presetColors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#8b5cf6', '#14b8a6'];

  function initWorkspaceModalPickers() {
    wsIconPicker.innerHTML = '';
    presetIcons.forEach(icon => {
      const el = document.createElement('div');
      el.className = 'icon-choice' + (icon === selectedWsIcon ? ' selected' : '');
      el.textContent = icon;
      el.addEventListener('click', () => {
        document.querySelectorAll('.icon-choice').forEach(c => c.classList.remove('selected'));
        el.classList.add('selected');
        selectedWsIcon = icon;
      });
      wsIconPicker.appendChild(el);
    });

    wsColorPicker.innerHTML = '';
    presetColors.forEach(color => {
      const el = document.createElement('div');
      el.className = 'color-choice' + (color === selectedWsColor ? ' selected' : '');
      el.style.backgroundColor = color;
      el.addEventListener('click', () => {
        document.querySelectorAll('.color-choice').forEach(c => c.classList.remove('selected'));
        el.classList.add('selected');
        selectedWsColor = color;
      });
      wsColorPicker.appendChild(el);
    });
  }

  function openCreateWorkspaceModal() {
    closeAllPopovers();
    inputWsName.value = '';
    selectedWsIcon = '📁';
    selectedWsColor = '#6366f1';
    initWorkspaceModalPickers();
    modalWorkspace.classList.remove('hidden');
    inputWsName.focus();
  }

  btnCreateWs.addEventListener('click', openCreateWorkspaceModal);
  btnOpenCreateWsModal.addEventListener('click', openCreateWorkspaceModal);
  btnCloseWsModal.addEventListener('click', () => modalWorkspace.classList.add('hidden'));

  btnSaveWorkspace.addEventListener('click', async () => {
    const name = inputWsName.value.trim();
    if (!name) {
      alert('Zadejte prosím název pracovního prostoru.');
      return;
    }
    const newWs = await api.createWorkspace(name, selectedWsIcon, selectedWsColor);
    modalWorkspace.classList.add('hidden');
    await api.switchWorkspace(newWs.id);
  });

  // Tab Context Menu Logic
  function openTabContextMenu(e, tab) {
    contextTargetTab = tab;
    tabContextMenu.style.left = `${Math.min(e.clientX, window.innerWidth - 220)}px`;
    tabContextMenu.style.top = `${Math.min(e.clientY, window.innerHeight - 200)}px`;
    tabContextMenu.classList.remove('hidden');

    // Populate workspaces submenu for moving tab
    ctxWorkspacesSubmenu.innerHTML = '';
    workspaces.forEach(ws => {
      const item = document.createElement('div');
      item.className = 'context-item';
      item.innerHTML = `<span>${ws.icon} ${ws.name}</span> ${ws.id === tab.workspaceId ? '✔' : ''}`;
      item.addEventListener('click', async () => {
        if (ws.id !== tab.workspaceId) {
          await api.moveTabToWorkspace(tab.id, ws.id);
        }
        tabContextMenu.classList.add('hidden');
      });
      ctxWorkspacesSubmenu.appendChild(item);
    });
  }

  document.addEventListener('click', (e) => {
    if (!tabContextMenu.contains(e.target)) {
      tabContextMenu.classList.add('hidden');
    }
  });

  ctxDuplicateTab.addEventListener('click', () => {
    if (contextTargetTab) api.duplicateTab(contextTargetTab.id);
    tabContextMenu.classList.add('hidden');
  });

  ctxPinTab.addEventListener('click', () => {
    if (contextTargetTab) api.togglePinTab(contextTargetTab.id);
    tabContextMenu.classList.add('hidden');
  });

  ctxMuteTab.addEventListener('click', () => {
    if (contextTargetTab) api.toggleMute(contextTargetTab.id);
    tabContextMenu.classList.add('hidden');
  });

  ctxCloseTab.addEventListener('click', () => {
    if (contextTargetTab) api.closeTab(contextTargetTab.id);
    tabContextMenu.classList.add('hidden');
  });

  // -------------------------------------------------------------
  // Navigation & Omnibox
  // -------------------------------------------------------------
  btnBack.addEventListener('click', () => {
    if (activeTabId) api.goBack(activeTabId);
  });

  btnForward.addEventListener('click', () => {
    if (activeTabId) api.goForward(activeTabId);
  });

  btnReload.addEventListener('click', () => {
    if (activeTabId) api.reload(activeTabId);
  });

  btnHome.addEventListener('click', () => {
    if (activeTabId) api.navigate(activeTabId, 'browsy://newtab');
  });

  omniboxInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const val = omniboxInput.value.trim();
      if (val && activeTabId) {
        api.navigate(activeTabId, val);
        omniboxInput.blur();
      }
    }
  });

  omniboxInput.addEventListener('focus', () => {
    omniboxInput.select();
  });

  // -------------------------------------------------------------
  // Popover Manager
  // -------------------------------------------------------------
  function closeAllPopovers() {
    [popoverShields, popoverVideo, popoverPopups, popoverExpander, popoverExtensions, popoverWorkspaceMenu].forEach(p => {
      if (p) p.classList.add('hidden');
    });
    activePopover = null;
  }

  function togglePopover(popoverEl) {
    if (activePopover === popoverEl) {
      popoverEl.classList.add('hidden');
      activePopover = null;
    } else {
      closeAllPopovers();
      popoverEl.classList.remove('hidden');
      activePopover = popoverEl;
    }
  }

  document.querySelectorAll('.popover-close-btn').forEach(btn => {
    btn.addEventListener('click', closeAllPopovers);
  });

  // -------------------------------------------------------------
  // 1. Shields & uBlock Origin Popover
  // -------------------------------------------------------------
  badgeShields.addEventListener('click', async () => {
    togglePopover(popoverShields);
    if (activePopover === popoverShields) {
      updateShieldsPopover();
    }
  });

  async function updateShieldsPopover() {
    const info = await api.getShieldsInfo();
    document.getElementById('shields-current-domain').textContent = currentDomain || 'Lokální rozhraní';
    document.getElementById('stat-tab-blocked').textContent = info.tabBlocked || 0;
    document.getElementById('stat-total-blocked').textContent = info.totalBlocked || 0;
    document.getElementById('shields-toggle-switch').checked = info.enabled;
  }

  document.getElementById('shields-toggle-switch').addEventListener('change', async (e) => {
    await api.toggleShields(e.target.checked);
  });

  // -------------------------------------------------------------
  // 2. Video Downloader Popover
  // -------------------------------------------------------------
  btnVideoDownloader.addEventListener('click', async () => {
    togglePopover(popoverVideo);
    if (activePopover === popoverVideo) {
      updateVideoPopover();
    }
  });

  async function updateVideoPopover() {
    const list = await api.getVideoMedia(activeTabId);
    const container = document.getElementById('video-list-container');
    const emptyState = document.getElementById('video-empty-state');

    if (!list || list.length === 0) {
      emptyState.classList.remove('hidden');
      container.classList.add('hidden');
      videoBadge.classList.add('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    container.classList.remove('hidden');
    container.innerHTML = '';

    list.forEach(item => {
      const itemEl = document.createElement('div');
      itemEl.className = 'video-item';

      const infoDiv = document.createElement('div');
      infoDiv.className = 'video-info';

      const titleDiv = document.createElement('div');
      titleDiv.className = 'video-title';
      titleDiv.textContent = item.title;
      infoDiv.appendChild(titleDiv);

      const metaDiv = document.createElement('div');
      metaDiv.className = 'video-meta';
      metaDiv.innerHTML = `<span><strong>${item.format}</strong></span> &bull; <span>${item.size}</span> ${item.resolution ? `&bull; <span>${item.resolution}</span>` : ''}`;
      infoDiv.appendChild(metaDiv);

      itemEl.appendChild(infoDiv);

      // Download Button
      const dlBtn = document.createElement('button');
      dlBtn.className = 'primary-btn';
      dlBtn.textContent = '⬇ Stáhnout';
      dlBtn.addEventListener('click', () => {
        api.downloadVideo(item.url);
        dlBtn.textContent = '✔ Stahování zahájeno';
        setTimeout(() => { dlBtn.textContent = '⬇ Stáhnout'; }, 2000);
      });
      itemEl.appendChild(dlBtn);

      container.appendChild(itemEl);
    });

    videoBadge.textContent = list.length;
    videoBadge.classList.remove('hidden');
  }

  // -------------------------------------------------------------
  // 3. Popup Blocked Popover
  // -------------------------------------------------------------
  badgePopup.addEventListener('click', async () => {
    togglePopover(popoverPopups);
    if (activePopover === popoverPopups) {
      const info = await api.getPopupInfo();
      const container = document.getElementById('popups-list-container');
      container.innerHTML = '';

      if (info.blockedList && info.blockedList.length > 0) {
        info.blockedList.forEach(p => {
          const row = document.createElement('div');
          row.className = 'snippet-row';
          row.innerHTML = `<span class="snippet-replacement" title="${p.url}">${p.url}</span> <span style="font-size: 10px; color: #888;">${p.time}</span>`;
          container.appendChild(row);
        });
      } else {
        container.innerHTML = '<div style="padding: 10px; color: #888; font-size: 12px;">Žádná vyskakovací okna nebyla zaznamenána.</div>';
      }
    }
  });

  document.getElementById('btn-allow-popups-domain').addEventListener('click', async () => {
    if (currentDomain) {
      await api.togglePopupWhitelist(currentDomain);
      badgePopup.classList.add('hidden');
      closeAllPopovers();
    }
  });

  // -------------------------------------------------------------
  // 4. Text Expander Popover
  // -------------------------------------------------------------
  btnTextExpander.addEventListener('click', async () => {
    togglePopover(popoverExpander);
    if (activePopover === popoverExpander) {
      updateExpanderList();
    }
  });

  async function updateExpanderList() {
    const cfg = await api.getSnippets();
    document.getElementById('expander-global-switch').checked = cfg.enabled;
    const container = document.getElementById('snippets-list-container');
    container.innerHTML = '';

    (cfg.snippets || []).forEach(s => {
      const row = document.createElement('div');
      row.className = 'snippet-row';

      const left = document.createElement('div');
      left.style.display = 'flex';
      left.style.alignItems = 'center';
      left.style.gap = '8px';

      const trig = document.createElement('span');
      trig.className = 'snippet-trigger';
      trig.textContent = s.trigger;
      left.appendChild(trig);

      const label = document.createElement('span');
      label.style.fontWeight = '500';
      label.textContent = s.label || '';
      left.appendChild(label);
      row.appendChild(left);

      const rep = document.createElement('span');
      rep.className = 'snippet-replacement';
      rep.textContent = s.replacement;
      row.appendChild(rep);

      const delBtn = document.createElement('button');
      delBtn.className = 'tab-close-btn';
      delBtn.innerHTML = '&times;';
      delBtn.title = 'Odstranit zkratku';
      delBtn.addEventListener('click', async () => {
        await api.deleteSnippet(s.id);
        updateExpanderList();
      });
      row.appendChild(delBtn);

      container.appendChild(row);
    });
  }

  document.getElementById('expander-global-switch').addEventListener('change', async (e) => {
    await api.toggleExpander(e.target.checked);
  });

  document.getElementById('btn-add-snippet').addEventListener('click', async () => {
    const trig = document.getElementById('new-snippet-trigger').value.trim();
    const lbl = document.getElementById('new-snippet-label').value.trim();
    const rep = document.getElementById('new-snippet-replacement').value;

    if (trig && rep) {
      await api.addSnippet(trig, rep, lbl);
      document.getElementById('new-snippet-trigger').value = '';
      document.getElementById('new-snippet-label').value = '';
      document.getElementById('new-snippet-replacement').value = '';
      updateExpanderList();
    }
  });

  // -------------------------------------------------------------
  // 5. Extensions Popover
  // -------------------------------------------------------------
  btnExtensions.addEventListener('click', async () => {
    togglePopover(popoverExtensions);
    if (activePopover === popoverExtensions) {
      updateExtensionsPopover();
    }
  });

  async function updateExtensionsPopover() {
    const list = await api.getExtensions();
    const container = document.getElementById('quick-extensions-list');
    container.innerHTML = '';

    list.forEach(ext => {
      const item = document.createElement('div');
      item.className = 'snippet-row';

      const info = document.createElement('div');
      info.innerHTML = `<strong>${ext.name}</strong> <span style="font-size:10px; color:#888;">v${ext.version} (${ext.source.toUpperCase()})</span>`;
      item.appendChild(info);

      const sw = document.createElement('label');
      sw.className = 'switch';
      sw.innerHTML = `<input type="checkbox" ${ext.enabled ? 'checked' : ''}><span class="slider round"></span>`;
      sw.querySelector('input').addEventListener('change', async (e) => {
        await api.toggleExtension(ext.id, e.target.checked);
      });
      item.appendChild(sw);

      container.appendChild(item);
    });
  }

  document.getElementById('btn-quick-install-ext').addEventListener('click', async () => {
    const res = await api.pickAndInstallExtension();
    if (res && res.success) {
      alert(`Doplněk "${res.extension.name}" byl úspěšně nainstalován!`);
      updateExtensionsPopover();
    } else if (res && res.error) {
      alert(`Chyba instalace: ${res.error}`);
    }
  });

  document.getElementById('btn-open-extensions-page').addEventListener('click', () => {
    if (activeTabId) {
      api.navigate(activeTabId, 'browsy://extensions');
      closeAllPopovers();
    }
  });

  // -------------------------------------------------------------
  // 6. Settings Modal
  // -------------------------------------------------------------
  btnSettings.addEventListener('click', async () => {
    const settings = await api.getSettings();
    document.getElementById('setting-tab-layout').value = settings.tabLayout || 'horizontal';
    document.getElementById('setting-search-engine').value = settings.defaultSearchEngine || 'google';
    document.getElementById('setting-shields-enabled').checked = settings.shieldsEnabled !== false;
    document.getElementById('setting-popup-enabled').checked = settings.popupBlockerEnabled !== false;
    document.getElementById('setting-video-enabled').checked = settings.videoDownloaderEnabled !== false;
    modalSettings.classList.remove('hidden');
  });

  document.getElementById('btn-close-settings-modal').addEventListener('click', () => {
    modalSettings.classList.add('hidden');
  });

  document.getElementById('setting-tab-layout').addEventListener('change', async (e) => {
    await applyLayout(e.target.value);
  });

  document.getElementById('setting-search-engine').addEventListener('change', async (e) => {
    await api.setSetting('defaultSearchEngine', e.target.value);
  });

  document.getElementById('setting-shields-enabled').addEventListener('change', async (e) => {
    await api.setSetting('shieldsEnabled', e.target.checked);
    await api.toggleShields(e.target.checked);
  });

  document.getElementById('setting-popup-enabled').addEventListener('change', async (e) => {
    await api.setSetting('popupBlockerEnabled', e.target.checked);
    await api.togglePopupBlocker(e.target.checked);
  });

  document.getElementById('setting-video-enabled').addEventListener('change', async (e) => {
    await api.setSetting('videoDownloaderEnabled', e.target.checked);
  });

  // -------------------------------------------------------------
  // Event Subscriptions from Main Process
  // -------------------------------------------------------------
  api.onTabsListUpdated((data) => {
    currentTabs = data.tabs || [];
    activeTabId = data.activeTabId;
    activeWorkspaceId = data.activeWorkspaceId || activeWorkspaceId;
    workspaces = data.workspaces || workspaces;
    renderTabs();
  });

  api.onWorkspaceChanged((data) => {
    activeWorkspaceId = data.activeWorkspaceId;
    workspaces = data.workspaces;
    updateWorkspacesUI();
    renderTabs();
  });

  api.onActiveTabChanged((data) => {
    activeTabId = data.id;
    btnBack.disabled = !data.canGoBack;
    btnForward.disabled = !data.canGoForward;

    // Omnibox URL
    function formatOmniboxDisplay(rawUrl) {
      if (!rawUrl || rawUrl.startsWith('browsy://newtab') || rawUrl.includes('newtab.html') || rawUrl === 'about:blank') {
        return '';
      }
      if (rawUrl.startsWith('browsy://extensions') || rawUrl.includes('extensions.html')) {
        return 'browsy://extensions';
      }
      return rawUrl;
    }

    omniboxInput.value = formatOmniboxDisplay(data.url);

    try {
      currentDomain = data.url ? new URL(data.url).hostname : '';
    } catch (e) {
      currentDomain = '';
    }

    // Shields blocked badge
    const blockedCount = data.blockedAds || 0;
    shieldsBlockedCount.textContent = blockedCount;

    // Popups badge
    const popupsCount = (data.blockedPopups && data.blockedPopups.length) || 0;
    if (popupsCount > 0) {
      popupBlockedCount.textContent = popupsCount;
      badgePopup.classList.remove('hidden');
    } else {
      badgePopup.classList.add('hidden');
    }

    // Video Downloader badge
    const mediaCount = (data.detectedMedia && data.detectedMedia.length) || 0;
    if (mediaCount > 0) {
      videoBadge.textContent = mediaCount;
      videoBadge.classList.remove('hidden');
    } else {
      videoBadge.classList.add('hidden');
    }

    renderTabs();
    setTimeout(syncViewportBounds, 30);
  });

  api.onTabUpdated((tab) => {
    const idx = currentTabs.findIndex(t => t.id === tab.id);
    if (idx >= 0) {
      currentTabs[idx] = { ...currentTabs[idx], ...tab };
      renderTabs();
    }
    if (tab.id === activeTabId) {
      btnBack.disabled = !tab.canGoBack;
      btnForward.disabled = !tab.canGoForward;
      if (document.activeElement !== omniboxInput) {
        function formatOmniboxDisplay(rawUrl) {
          if (!rawUrl || rawUrl.startsWith('browsy://newtab') || rawUrl.includes('newtab.html') || rawUrl === 'about:blank') {
            return '';
          }
          if (rawUrl.startsWith('browsy://extensions') || rawUrl.includes('extensions.html')) {
            return 'browsy://extensions';
          }
          return rawUrl;
        }
        omniboxInput.value = formatOmniboxDisplay(tab.url);
      }
    }
  });

  api.onPopupBlocked((data) => {
    popupBlockedCount.textContent = data.count || 1;
    badgePopup.classList.remove('hidden');
  });

  api.onMediaDetected((data) => {
    videoBadge.textContent = data.count || 1;
    videoBadge.classList.remove('hidden');
    if (activePopover === popoverVideo) {
      updateVideoPopover();
    }
  });

  // Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === 't') {
      e.preventDefault();
      api.createTab('browsy://newtab', { workspaceId: activeWorkspaceId });
    } else if (e.ctrlKey && e.key.toLowerCase() === 'w') {
      e.preventDefault();
      if (activeTabId) api.closeTab(activeTabId);
    } else if (e.ctrlKey && e.key.toLowerCase() === 'r') {
      e.preventDefault();
      if (activeTabId) api.reload(activeTabId);
    } else if (e.ctrlKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      omniboxInput.focus();
      omniboxInput.select();
    } else if (e.altKey && e.key >= '1' && e.key <= '9') {
      // Quick workspace switch (Alt+1, Alt+2, etc.)
      const idx = parseInt(e.key, 10) - 1;
      if (workspaces[idx]) {
        e.preventDefault();
        api.switchWorkspace(workspaces[idx].id);
      }
    } else if (e.key === 'Escape') {
      closeAllPopovers();
      modalSettings.classList.add('hidden');
      modalWorkspace.classList.add('hidden');
      tabContextMenu.classList.add('hidden');
    }
  });

  // Initial setup
  const initSettings = await api.getSettings();
  if (initSettings.tabLayout) {
    applyLayout(initSettings.tabLayout);
  }

  // Load initial workspaces
  try {
    workspaces = await api.getWorkspaces();
    activeWorkspaceId = await api.getActiveWorkspace();
    updateWorkspacesUI();
  } catch (e) {
    console.error('Error loading initial workspaces:', e);
  }

  syncViewportBounds();
});
