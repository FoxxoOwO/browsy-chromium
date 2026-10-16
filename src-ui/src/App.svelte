<script>
  import { onMount } from 'svelte';
  import Icon from './components/Icon.svelte';

  const api = typeof window !== 'undefined' ? window.browsyAPI : null;

  // Svelte 5 Runes ($state, $derived, $effect)
  let currentTabs = $state([]);
  let activeTabId = $state(null);
  let workspaces = $state([]);
  let activeWorkspaceId = $state('ws_default');
  let layoutMode = $state('horizontal'); // 'horizontal' | 'vertical'
  let sidebarCollapsed = $state(false);

  let omniboxValue = $state('');
  let canGoBack = $state(false);
  let canGoForward = $state(false);
  let currentDomain = $state('');

  let blockedAdsCount = $state(0);
  let blockedPopups = $state([]);
  let detectedVideos = $state([]);
  let expanderConfig = $state({ enabled: true, snippets: [] });
  let extensionsList = $state([]);
  let activePopover = $state(null); // 'shields' | 'video' | 'popups' | 'expander' | 'extensions' | 'workspace' | null
  let showWorkspaceModal = $state(false);

  // Store Extension Detection State
  let activeStoreInfo = $state(null);
  let isInstallingStoreExt = $state(false);
  let storeInstallSuccess = $state(false);

  // New Workspace Form
  let newWsName = $state('');
  let newWsIcon = $state('personal');
  let newWsColor = $state('#f4f4f5');

  // New Snippet Form
  let newSnippetTrigger = $state('');
  let newSnippetLabel = $state('');
  let newSnippetReplacement = $state('');

  // Tab Context Menu State
  let contextMenu = $state({ visible: false, x: 0, y: 0, tab: null });

  let viewportEl;

  // Derived state ($derived)
  let visibleTabs = $derived(
    currentTabs.filter(t => !t.workspaceId || t.workspaceId === activeWorkspaceId)
  );

  let activeWorkspace = $derived(
    workspaces.find(w => w.id === activeWorkspaceId) || workspaces[0] || { id: 'ws_default', name: 'Osobní', icon: 'personal', color: '#f4f4f5' }
  );

  // Minimalist monochromatic presets (clean SVG icon IDs & neutral grays)
  const presetIcons = [
    { id: 'personal', label: 'Osobní' },
    { id: 'work', label: 'Práce' },
    { id: 'dev', label: 'Vývoj' },
    { id: 'study', label: 'Studium' },
    { id: 'gaming', label: 'Hry' },
    { id: 'star', label: 'Oblíbené' },
    { id: 'folder', label: 'Složka' },
    { id: 'layers', label: 'Prostor' },
    { id: 'globe', label: 'Web' }
  ];

  const presetColors = ['#f4f4f5', '#d4d4d8', '#a1a1aa', '#71717a', '#52525b', '#3f3f46'];

  function mapWorkspaceIcon(raw) {
    if (!raw) return 'personal';
    if (raw === '👤' || raw === 'personal' || raw === 'user') return 'personal';
    if (raw === '💼' || raw === 'work' || raw === 'briefcase') return 'work';
    if (raw === '⚡' || raw === 'dev' || raw === 'code') return 'dev';
    if (raw === '🎓' || raw === 'study' || raw === 'book') return 'study';
    if (raw === '🎮' || raw === 'gaming' || raw === 'gamepad') return 'gaming';
    if (raw === '📁' || raw === 'folder') return 'folder';
    if (raw === '⭐' || raw === 'star') return 'star';
    if (raw === '🌐' || raw === 'globe') return 'globe';
    if (raw === 'layers') return 'layers';
    return 'personal';
  }

  // Viewport sync
  function syncViewport() {
    if (!viewportEl || !api) return;
    const rect = viewportEl.getBoundingClientRect();
    api.updateContentBounds({
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.max(100, Math.round(rect.width)),
      height: Math.max(100, Math.round(rect.height))
    });
  }

  function formatOmniboxDisplay(rawUrl) {
    if (!rawUrl || rawUrl.startsWith('browsy://newtab') || rawUrl.includes('newtab.html') || rawUrl === 'about:blank') {
      return '';
    }
    if (rawUrl.startsWith('browsy://extensions') || rawUrl.includes('extensions.html')) {
      return 'browsy://extensions';
    }
    if (rawUrl.startsWith('browsy://settings') || rawUrl.includes('settings.html')) {
      return 'browsy://settings';
    }
    return rawUrl;
  }

  // Prevent WebContentsView from covering popovers or modals
  $effect(() => {
    const isOverlayActive = showWorkspaceModal || activePopover !== null;
    if (api && api.setViewVisibility) {
      api.setViewVisibility(!isOverlayActive);
    }
  });

  onMount(async () => {
    if (!api) return;

    window.addEventListener('resize', syncViewport);

    // Initial settings & workspaces
    try {
      const s = await api.getSettings();
      settingsData = s;
      if (s.tabLayout) layoutMode = s.tabLayout;
      workspaces = await api.getWorkspaces();
      activeWorkspaceId = await api.getActiveWorkspace();
    } catch (e) {
      console.error(e);
    }

    // Event listeners
    api.onTabsListUpdated((data) => {
      currentTabs = data.tabs || [];
      activeTabId = data.activeTabId;
      if (data.workspaces) workspaces = data.workspaces;
      if (data.activeWorkspaceId) activeWorkspaceId = data.activeWorkspaceId;
      setTimeout(syncViewport, 30);
    });

    api.onWorkspaceChanged((data) => {
      activeWorkspaceId = data.activeWorkspaceId;
      workspaces = data.workspaces;
      setTimeout(syncViewport, 30);
    });

    api.onActiveTabChanged((data) => {
      activeTabId = data.id;
      canGoBack = data.canGoBack;
      canGoForward = data.canGoForward;
      omniboxValue = formatOmniboxDisplay(data.url);
      try {
        currentDomain = data.url ? new URL(data.url).hostname : '';
      } catch (e) {
        currentDomain = '';
      }
      blockedAdsCount = data.blockedAds || 0;
      blockedPopups = data.blockedPopups || [];
      detectedVideos = data.detectedMedia || [];
      activeStoreInfo = data.storeInfo && data.storeInfo.isStore ? data.storeInfo : null;
      storeInstallSuccess = false;
      setTimeout(syncViewport, 30);
    });

    api.onTabUpdated((tab) => {
      const idx = currentTabs.findIndex(t => t.id === tab.id);
      if (idx >= 0) {
        currentTabs[idx] = { ...currentTabs[idx], ...tab };
      }
      if (tab.id === activeTabId) {
        canGoBack = tab.canGoBack;
        canGoForward = tab.canGoForward;
        omniboxValue = formatOmniboxDisplay(tab.url);
        activeStoreInfo = tab.storeInfo && tab.storeInfo.isStore ? tab.storeInfo : null;
      }
    });

    api.onPopupBlocked((data) => {
      blockedPopups = [...blockedPopups, data.record];
    });

    api.onMediaDetected((data) => {
      detectedVideos = [...detectedVideos, data.item];
    });

    // Keyboard shortcuts
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
      } else if (e.altKey && e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key, 10) - 1;
        if (workspaces[idx]) {
          e.preventDefault();
          api.switchWorkspace(workspaces[idx].id);
        }
      } else if (e.key === 'Escape') {
        activePopover = null;
        showWorkspaceModal = false;
        contextMenu.visible = false;
      }
    });

    setTimeout(syncViewport, 100);
  });

  // Actions
  function switchTab(id) {
    if (api) api.switchTab(id);
  }

  function closeTab(id, e) {
    if (e) e.stopPropagation();
    if (api) api.closeTab(id);
  }

  function createTab() {
    if (api) api.createTab('browsy://newtab', { workspaceId: activeWorkspaceId });
  }

  function navigate(url) {
    if (!url.trim() || !api || !activeTabId) return;
    api.navigate(activeTabId, url.trim());
  }

  function toggleMute(tabId, e) {
    if (e) e.stopPropagation();
    if (api) api.toggleMute(tabId);
  }

  function toggleLayout() {
    const next = layoutMode === 'horizontal' ? 'vertical' : 'horizontal';
    layoutMode = next;
    if (api) api.setLayoutMode(next);
    setTimeout(syncViewport, 50);
  }

  function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;
    setTimeout(syncViewport, 50);
  }

  function togglePopover(name) {
    activePopover = activePopover === name ? null : name;
    if (activePopover === 'expander') loadExpander();
    if (activePopover === 'extensions') loadExtensions();
  }

  function openSettings() {
    activePopover = null;
    const existing = currentTabs.find(t => t.url && (t.url.startsWith('browsy://settings') || t.url.includes('settings.html')));
    if (existing) {
      api.switchTab(existing.id);
    } else {
      api.createTab('browsy://settings', { workspaceId: activeWorkspaceId });
    }
  }

  function createTabWithUrl(url) {
    if (api) api.createTab(url, { workspaceId: activeWorkspaceId });
  }

  async function installActiveStoreExtension() {
    if (!activeStoreInfo || !api || isInstallingStoreExt) return;
    isInstallingStoreExt = true;
    storeInstallSuccess = false;

    try {
      const res = await api.installFromStore(activeStoreInfo.store, activeStoreInfo.id, '');
      if (res.success) {
        storeInstallSuccess = true;
        loadExtensions();
        setTimeout(() => {
          storeInstallSuccess = false;
        }, 3000);
      } else {
        alert('Chyba při instalaci: ' + (res.error || 'Neznámá chyba'));
      }
    } catch (e) {
      alert('Chyba: ' + e.message);
    } finally {
      isInstallingStoreExt = false;
    }
  }

  async function loadExpander() {
    if (api) expanderConfig = await api.getSnippets();
  }

  async function loadExtensions() {
    if (api) extensionsList = await api.getExtensions();
  }

  function openContextMenu(e, tab) {
    e.preventDefault();
    contextMenu = {
      visible: true,
      x: Math.min(e.clientX, window.innerWidth - 220),
      y: Math.min(e.clientY, window.innerHeight - 200),
      tab: tab
    };
  }

  async function moveTabToWorkspace(tabId, targetWsId) {
    if (api) await api.moveTabToWorkspace(tabId, targetWsId);
    contextMenu.visible = false;
  }

  async function saveNewWorkspace() {
    if (!newWsName.trim() || !api) return;
    const ws = await api.createWorkspace(newWsName.trim(), newWsIcon, newWsColor);
    showWorkspaceModal = false;
    newWsName = '';
    await api.switchWorkspace(ws.id);
  }

  async function addSnippet() {
    if (!newSnippetTrigger.trim() || !newSnippetReplacement || !api) return;
    await api.addSnippet(newSnippetTrigger.trim(), newSnippetReplacement, newSnippetLabel.trim());
    newSnippetTrigger = '';
    newSnippetLabel = '';
    newSnippetReplacement = '';
    loadExpander();
  }
</script>

<svelte:window onclick={() => { if (contextMenu.visible) contextMenu.visible = false; }} />

<div id="browser-container" class={`theme-dark layout-${layoutMode}`}>
  <!-- Header Bar -->
  <header id="browser-header">
    {#if layoutMode === 'horizontal'}
      <!-- Horizontal Tab Strip -->
      <div id="horizontal-tab-bar" class="tab-bar">
        <button class="workspace-pill" onclick={() => togglePopover('workspace')} title="Přepnout pracovní prostor">
          <Icon name={mapWorkspaceIcon(activeWorkspace.icon)} size={14} />
          <span class="ws-name">{activeWorkspace.name}</span>
          <Icon name="chevron-down" size={12} class="ws-arrow" />
        </button>

        <div class="tabs-scroll-area">
          {#each visibleTabs as tab (tab.id)}
            <div
              class={`tab ${tab.id === activeTabId ? 'active' : ''}`}
              onclick={() => switchTab(tab.id)}
              oncontextmenu={(e) => openContextMenu(e, tab)}
              role="button"
              tabindex="0"
            >
              <div class="tab-favicon">
                {#if tab.favicon}
                  <img src={tab.favicon} alt="" onerror={(e) => e.target.style.display = 'none'} />
                {:else}
                  <Icon name="globe" size={14} />
                {/if}
              </div>
              <span class="tab-title">{tab.title || (tab.isLoading ? 'Načítání...' : 'Nová záložka')}</span>
              {#if tab.isAudioPlaying || tab.isMuted}
                <button class="tab-audio-btn" onclick={(e) => toggleMute(tab.id, e)} title={tab.isMuted ? 'Zapnout zvuk' : 'Ztlumit zvuk'}>
                  <Icon name={tab.isMuted ? 'volume-x' : 'volume'} size={13} />
                </button>
              {/if}
              <button class="tab-close-btn" onclick={(e) => closeTab(tab.id, e)} title="Zavřít záložku">
                <Icon name="close" size={12} />
              </button>
            </div>
          {/each}
        </div>

        <button class="nav-btn icon-btn new-tab-btn" onclick={createTab} title="Nová záložka (Ctrl+T)">
          <Icon name="plus" size={16} />
        </button>
      </div>
    {/if}

    <!-- Nav Bar & Omnibox -->
    <div id="nav-bar">
      <div class="nav-group nav-controls">
        <button class="nav-btn" disabled={!canGoBack} onclick={() => api.goBack(activeTabId)} title="Zpět">
          <Icon name="back" size={16} />
        </button>
        <button class="nav-btn" disabled={!canGoForward} onclick={() => api.goForward(activeTabId)} title="Vpřed">
          <Icon name="forward" size={16} />
        </button>
        <button class="nav-btn" onclick={() => api.reload(activeTabId)} title="Obnovit (F5)">
          <Icon name="reload" size={15} />
        </button>
        <button class="nav-btn" onclick={() => navigate('browsy://newtab')} title="Domů">
          <Icon name="home" size={15} />
        </button>
      </div>

      <div id="omnibox-container">
        <span class="omnibox-icon">
          <Icon name="lock" size={14} />
        </span>
        <input
          type="text"
          id="omnibox-input"
          placeholder="Zadejte webovou adresu nebo vyhledejte na webu"
          bind:value={omniboxValue}
          onkeydown={(e) => { if (e.key === 'Enter') navigate(omniboxValue); }}
        />
        <div class="omnibox-badges">
          {#if activeStoreInfo}
            <button
              class="badge-btn store-badge"
              onclick={installActiveStoreExtension}
              title={`Instalovat doplněk z ${activeStoreInfo.storeName}`}
              disabled={isInstallingStoreExt}
            >
              {#if isInstallingStoreExt}
                <span>Instaluji...</span>
              {:else if storeInstallSuccess}
                <span>✔ Přidáno!</span>
              {:else}
                <Icon name="plus" size={12} />
                <span>Přidat do Browsy</span>
              {/if}
            </button>
          {/if}
          {#if blockedPopups.length > 0}
            <button class="badge-btn popup-badge" onclick={() => togglePopover('popups')} title="Zablokovaná vyskakovací okna">
              <Icon name="ban" size={13} />
              <span>{blockedPopups.length}</span>
            </button>
          {/if}
          <button class="badge-btn shields-badge" onclick={() => togglePopover('shields')} title="Browsy Shields & uBlock Origin (Rust Native)">
            <Icon name="shield" size={13} />
            <span>{blockedAdsCount}</span>
          </button>
        </div>
      </div>

      <div class="nav-group action-tools">
        <!-- Video Downloader -->
        <button class="nav-btn action-btn has-badge" onclick={() => togglePopover('video')} title="Stahovač videí">
          <Icon name="video" size={16} />
          {#if detectedVideos.length > 0}
            <span class="tool-counter-badge">{detectedVideos.length}</span>
          {/if}
        </button>

        <!-- Text Expander -->
        <button class="nav-btn action-btn" onclick={() => togglePopover('expander')} title="Text Expander">
          <Icon name="expander" size={15} />
        </button>

        <!-- Extensions -->
        <button class="nav-btn action-btn" onclick={() => togglePopover('extensions')} title="Doplňky (Chrome & Firefox)">
          <Icon name="extensions" size={15} />
        </button>

        <!-- Tab Layout Switcher -->
        <button class="nav-btn action-btn" onclick={toggleLayout} title="Přepnout rozložení tabů">
          <Icon name="layout" size={15} />
        </button>

        <!-- Settings (Opens dedicated browsy://settings) -->
        <button class="nav-btn action-btn" onclick={openSettings} title="Nastavení Browsy">
          <Icon name="settings" size={16} />
        </button>
      </div>
    </div>
  </header>

  <!-- Main Body -->
  <div id="browser-body">
    {#if layoutMode === 'vertical'}
      <!-- Vertical Zen Sidebar -->
      <aside id="vertical-sidebar" class={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div class="v-workspace-header">
          <button class="v-ws-pill" onclick={() => togglePopover('workspace')} title="Změnit pracovní prostor">
            <Icon name={mapWorkspaceIcon(activeWorkspace.icon)} size={14} class="ws-icon" />
            <span class="v-ws-name">{activeWorkspace.name}</span>
            <Icon name="chevron-down" size={12} class="ws-arrow" />
          </button>
          <button class="nav-btn icon-btn" onclick={toggleSidebar} title="Sbalit/Rozbalit panel">
            <Icon name="layout" size={14} />
          </button>
        </div>

        <div class="sidebar-top">
          <button class="v-new-tab-btn" onclick={createTab}>
            <Icon name="plus" size={15} />
            <span class="v-btn-text">Nová záložka</span>
          </button>
        </div>

        <div class="v-tabs-scroll-area">
          {#each visibleTabs as tab (tab.id)}
            <div
              class={`v-tab ${tab.id === activeTabId ? 'active' : ''}`}
              onclick={() => switchTab(tab.id)}
              oncontextmenu={(e) => openContextMenu(e, tab)}
              role="button"
              tabindex="0"
            >
              <div class="tab-favicon">
                {#if tab.favicon}
                  <img src={tab.favicon} alt="" onerror={(e) => e.target.style.display = 'none'} />
                {:else}
                  <Icon name="globe" size={14} />
                {/if}
              </div>
              <span class="tab-title">{tab.title || (tab.isLoading ? 'Načítání...' : 'Nová záložka')}</span>
              {#if tab.isAudioPlaying || tab.isMuted}
                <button class="tab-audio-btn" onclick={(e) => toggleMute(tab.id, e)}>
                  <Icon name={tab.isMuted ? 'volume-x' : 'volume'} size={13} />
                </button>
              {/if}
              <button class="tab-close-btn" onclick={(e) => closeTab(tab.id, e)} title="Zavřít">
                <Icon name="close" size={12} />
              </button>
            </div>
          {/each}
        </div>

        <!-- Zen Workspace Dock at Bottom -->
        <div
          class="zen-ws-dock"
          onwheel={(e) => {
            e.preventDefault();
            if (workspaces.length <= 1) return;
            const currentIdx = workspaces.findIndex(w => w.id === activeWorkspaceId);
            let nextIdx = e.deltaY > 0 ? currentIdx + 1 : currentIdx - 1;
            if (nextIdx >= workspaces.length) nextIdx = 0;
            if (nextIdx < 0) nextIdx = workspaces.length - 1;
            api.switchWorkspace(workspaces[nextIdx].id);
          }}
        >
          <div class="zen-ws-list">
            {#each workspaces as ws}
              <button
                class={`zen-ws-btn ${ws.id === activeWorkspaceId ? 'active' : ''}`}
                onclick={() => api.switchWorkspace(ws.id)}
                title={`${ws.name} (${currentTabs.filter(t => t.workspaceId === ws.id).length} záložek)`}
              >
                <Icon name={mapWorkspaceIcon(ws.icon)} size={15} />
              </button>
            {/each}
          </div>
          <button class="zen-ws-btn zen-ws-add" onclick={() => showWorkspaceModal = true} title="Nový prostor">
            <Icon name="plus" size={14} />
          </button>
        </div>
      </aside>
    {/if}

    <!-- Chromium WebContentsView Viewport Target -->
    <main id="web-view-viewport" bind:this={viewportEl}></main>
  </div>

  <!-- Popovers (Monochromatic with SVGs) -->
  {#if activePopover === 'shields'}
    <div class="popover">
      <div class="popover-header">
        <div class="popover-title">
          <Icon name="shield" size={16} />
          <span>Browsy Shields & uBlock (Rust Core)</span>
        </div>
        <button class="popover-close-btn" onclick={() => activePopover = null}>
          <Icon name="close" size={14} />
        </button>
      </div>
      <div class="popover-content">
        <div class="shields-toggle-card">
          <div>
            <div class="toggle-name">Ochrana na této stránce</div>
            <div class="toggle-sub">{currentDomain || 'Lokální rozhraní'}</div>
          </div>
        </div>
        <div class="shields-stats-grid">
          <div class="stat-box">
            <span class="stat-number">{blockedAdsCount}</span>
            <span class="stat-label">Blokováno na stránce</span>
          </div>
          <div class="stat-box">
            <span class="stat-number">Rust</span>
            <span class="stat-label">Brave adblock-rust</span>
          </div>
        </div>
      </div>
    </div>
  {/if}

  {#if activePopover === 'video'}
    <div class="popover">
      <div class="popover-header">
        <div class="popover-title">
          <Icon name="video" size={16} />
          <span>Web Video Downloader</span>
        </div>
        <button class="popover-close-btn" onclick={() => activePopover = null}>
          <Icon name="close" size={14} />
        </button>
      </div>
      <div class="popover-content">
        {#if detectedVideos.length === 0}
          <div class="empty-state">Na stránce zatím nebyla nalezena žádná videa.</div>
        {:else}
          {#each detectedVideos as v}
            <div class="video-item">
              <div class="video-info">
                <div class="video-title">{v.title}</div>
                <div class="video-meta"><strong>{v.format}</strong> &bull; {v.size}</div>
              </div>
              <button class="primary-btn" onclick={() => api.downloadVideo(v.url)}>Stáhnout</button>
            </div>
          {/each}
        {/if}
      </div>
    </div>
  {/if}

  {#if activePopover === 'workspace'}
    <div class="popover">
      <div class="popover-header">
        <div class="popover-title">
          <Icon name="layers" size={16} />
          <span>Pracovní prostory (Zen Workspaces)</span>
        </div>
        <button class="popover-close-btn" onclick={() => activePopover = null}>
          <Icon name="close" size={14} />
        </button>
      </div>
      <div class="popover-content">
        <div class="workspace-list">
          {#each workspaces as ws}
            <div
              class={`ws-item-row ${ws.id === activeWorkspaceId ? 'active' : ''}`}
              onclick={() => { api.switchWorkspace(ws.id); activePopover = null; }}
              role="button"
              tabindex="0"
            >
              <div class="ws-item-info">
                <Icon name={mapWorkspaceIcon(ws.icon)} size={15} />
                <span style="font-weight: 600; color: #f4f4f5;">{ws.name}</span>
              </div>
              <span class="ws-item-badge">{currentTabs.filter(t => t.workspaceId === ws.id).length} záložek</span>
            </div>
          {/each}
        </div>
        <button class="primary-btn full-width" style="margin-top:12px;" onclick={() => { activePopover = null; showWorkspaceModal = true; }}>
          <Icon name="plus" size={14} />
          <span>Vytvořit nový prostor</span>
        </button>
      </div>
    </div>
  {/if}

  {#if activePopover === 'expander'}
    <div class="popover expander-popover">
      <div class="popover-header">
        <div class="popover-title">
          <Icon name="expander" size={16} />
          <span>Text Expander</span>
        </div>
        <button class="popover-close-btn" onclick={() => activePopover = null}>
          <Icon name="close" size={14} />
        </button>
      </div>
      <div class="popover-content">
        <div class="snippet-add-box">
          <input type="text" placeholder="Zkratka (:adresa)" bind:value={newSnippetTrigger} style="width: 30%;" />
          <input type="text" placeholder="Popisek" bind:value={newSnippetLabel} style="width: 30%;" />
          <input type="text" placeholder="Text ({date})" bind:value={newSnippetReplacement} style="width: 30%;" />
          <button class="primary-btn" onclick={addSnippet} style="width: 10%;">
            <Icon name="plus" size={14} />
          </button>
        </div>
        {#each expanderConfig.snippets as s}
          <div class="snippet-row">
            <div>
              <span class="snippet-trigger">{s.trigger}</span>
              <strong style="margin-left: 6px;">{s.label}</strong>
            </div>
            <span class="snippet-replacement">{s.replacement}</span>
            <button class="tab-close-btn" onclick={async () => { await api.deleteSnippet(s.id); loadExpander(); }}>
              <Icon name="close" size={12} />
            </button>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#if activePopover === 'extensions'}
    <div class="popover">
      <div class="popover-header">
        <div class="popover-title">
          <Icon name="extensions" size={16} />
          <span>Doplňky (Chrome & Firefox)</span>
        </div>
        <button class="popover-close-btn" onclick={() => activePopover = null}>
          <Icon name="close" size={14} />
        </button>
      </div>
      <div class="popover-content">
        <button class="primary-btn full-width" onclick={async () => { const res = await api.pickAndInstallExtension(); if (res.success) loadExtensions(); }}>
          <Icon name="plus" size={14} />
          <span>Nainstalovat doplněk (.crx / .xpi / .zip)</span>
        </button>
        <button class="secondary-btn full-width" style="margin-top: 8px;" onclick={() => { navigate('browsy://extensions'); activePopover = null; }}>
          Spravovat doplňky
        </button>

        <div style="font-size:11px; font-weight:600; color:var(--text-muted); margin-top:14px; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.5px;">Katalogy doplňků</div>
        <div style="display:flex; flex-direction:column; gap:6px;">
          <button class="secondary-btn full-width" style="text-align:left; justify-content:flex-start;" onclick={() => { createTabWithUrl('https://chromewebstore.google.com'); activePopover = null; }}>
            <Icon name="globe" size={14} />
            <span style="margin-left:8px;">Chrome Web Store</span>
          </button>
          <button class="secondary-btn full-width" style="text-align:left; justify-content:flex-start;" onclick={() => { createTabWithUrl('https://addons.opera.com/extensions/'); activePopover = null; }}>
            <Icon name="extensions" size={14} />
            <span style="margin-left:8px;">Opera Add-ons Store</span>
          </button>
          <button class="secondary-btn full-width" style="text-align:left; justify-content:flex-start;" onclick={() => { createTabWithUrl('https://addons.mozilla.org/firefox/extensions/'); activePopover = null; }}>
            <Icon name="star" size={14} />
            <span style="margin-left:8px;">Firefox Add-ons (AMO)</span>
          </button>
        </div>
        <div style="margin-top:12px;">
          {#each extensionsList as ext}
            <div class="snippet-row">
              <div><strong>{ext.name}</strong> <span style="font-size:10px; color:#888;">({ext.source})</span></div>
              <input type="checkbox" checked={ext.enabled} onchange={async (e) => await api.toggleExtension(ext.id, e.target.checked)} />
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}

  <!-- Modals -->
  {#if showWorkspaceModal}
    <div class="modal-backdrop">
      <div class="modal-dialog" style="width:440px;">
        <div class="modal-header">
          <h2>Nový pracovní prostor</h2>
          <button class="modal-close-btn" onclick={() => showWorkspaceModal = false}>
            <Icon name="close" size={16} />
          </button>
        </div>
        <div class="modal-body">
          <input
            type="text"
            placeholder="Název prostoru..."
            bind:value={newWsName}
            style="width:100%; padding:10px 12px; margin-bottom:14px; background:#09090b; border:1px solid #27272a; color:#f4f4f5; border-radius:8px; font-size:14px;"
          />
          <div style="font-size:12px; color:#71717a; margin-bottom:8px; font-weight:500;">Výběr ikony:</div>
          <div class="icon-picker-grid" style="margin-bottom:16px;">
            {#each presetIcons as item}
              <button
                class={`icon-choice ${item.id === newWsIcon ? 'selected' : ''}`}
                onclick={() => newWsIcon = item.id}
                title={item.label}
              >
                <Icon name={item.id} size={18} />
              </button>
            {/each}
          </div>

          <div style="font-size:12px; color:#71717a; margin-bottom:8px; font-weight:500;">Odstín akcentu:</div>
          <div class="color-picker-grid" style="margin-bottom:20px;">
            {#each presetColors as col}
              <button
                class={`color-choice ${col === newWsColor ? 'selected' : ''}`}
                style={`background: ${col};`}
                onclick={() => newWsColor = col}
              ></button>
            {/each}
          </div>

          <button class="primary-btn full-width" onclick={saveNewWorkspace}>Uložit prostor</button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Tab Context Menu -->
  {#if contextMenu.visible}
    <div class="context-menu" style={`left: ${contextMenu.x}px; top: ${contextMenu.y}px;`} onclick={(e) => e.stopPropagation()}>
      <div class="context-item" onclick={() => { api.duplicateTab(contextMenu.tab.id); contextMenu.visible = false; }}>Duplikovat záložku</div>
      <div class="context-item" onclick={() => { api.togglePinTab(contextMenu.tab.id); contextMenu.visible = false; }}>Připnout záložku</div>
      <div class="context-item" onclick={() => { api.toggleMute(contextMenu.tab.id); contextMenu.visible = false; }}>Ztlumit zvuk</div>
      <div class="context-separator"></div>
      <div class="context-item has-submenu">
        <span>Přesunout do prostoru</span>
        <div class="context-submenu">
          {#each workspaces as ws}
            <div class="context-item" onclick={() => moveTabToWorkspace(contextMenu.tab.id, ws.id)}>
              <Icon name={mapWorkspaceIcon(ws.icon)} size={14} />
              <span style="margin-left: 6px;">{ws.name}</span>
            </div>
          {/each}
        </div>
      </div>
      <div class="context-separator"></div>
      <div class="context-item danger" onclick={() => { api.closeTab(contextMenu.tab.id); contextMenu.visible = false; }}>Zavřít záložku</div>
    </div>
  {/if}
</div>

<style>
  @import '../../src/ui/style.css';
</style>
