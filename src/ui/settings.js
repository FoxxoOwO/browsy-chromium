const api = window.browsyAPI;

// Navigation Tabs
const navItems = document.querySelectorAll('.nav-item');
const sections = document.querySelectorAll('.settings-section');

navItems.forEach(item => {
  item.addEventListener('click', () => {
    navItems.forEach(n => n.classList.remove('active'));
    sections.forEach(s => s.classList.remove('active'));

    item.classList.add('active');
    const tab = item.getAttribute('data-tab');
    const targetSection = document.getElementById(`section-${tab}`);
    if (targetSection) targetSection.classList.add('active');
  });
});

// Load and populate settings
async function loadAllSettings() {
  if (!api) return;

  const settings = await api.getSettings();

  // Tab Layout
  const selectLayout = document.getElementById('select-tab-layout');
  if (selectLayout) {
    selectLayout.value = settings.tabLayout || 'horizontal';
    selectLayout.addEventListener('change', async (e) => {
      await api.setLayoutMode(e.target.value);
    });
  }

  // Search Engine
  const selectSearch = document.getElementById('select-search-engine');
  if (selectSearch) {
    selectSearch.value = settings.defaultSearchEngine || 'google';
    selectSearch.addEventListener('change', async (e) => {
      await api.setSetting('defaultSearchEngine', e.target.value);
    });
  }

  // Shields Toggle
  const switchShields = document.getElementById('switch-shields');
  if (switchShields) {
    switchShields.checked = settings.shieldsEnabled !== false;
    switchShields.addEventListener('change', async (e) => {
      await api.toggleShields(e.target.checked);
    });
  }

  // Popups Toggle
  const switchPopups = document.getElementById('switch-popups');
  if (switchPopups) {
    switchPopups.checked = settings.popupBlockerEnabled !== false;
    switchPopups.addEventListener('change', async (e) => {
      await api.togglePopupBlocker(e.target.checked);
    });
  }

  // Video Downloader Toggle
  const switchVideo = document.getElementById('switch-video');
  if (switchVideo) {
    switchVideo.checked = settings.videoDownloaderEnabled !== false;
    switchVideo.addEventListener('change', async (e) => {
      await api.setSetting('videoDownloaderEnabled', e.target.checked);
    });
  }

  // Expander Toggle
  const switchExpander = document.getElementById('switch-expander');
  if (switchExpander) {
    switchExpander.checked = settings.textExpanderEnabled !== false;
    switchExpander.addEventListener('change', async (e) => {
      await api.toggleExpander(e.target.checked);
    });
  }

  // Shields Whitelist
  renderShieldsWhitelist(settings.shieldsWhitelist || []);

  // Custom Filters
  const customFilters = api.getCustomFilters ? await api.getCustomFilters() : (settings.customFilters || []);
  renderCustomFilters(customFilters);

  // Popups Whitelist
  renderPopupsWhitelist(settings.popupWhitelist || []);

  // Snippets
  const snippetsRes = await api.getSnippets();
  renderSnippets((snippetsRes && snippetsRes.snippets) ? snippetsRes.snippets : (Array.isArray(snippetsRes) ? snippetsRes : []));
}

// Custom Filters (AdBlocker & Element Picker)
function renderCustomFilters(list) {
  const container = document.getElementById('custom-filters-list');
  const textarea = document.getElementById('textarea-custom-filters');
  if (textarea && document.activeElement !== textarea) {
    textarea.value = (list || []).join('\n');
  }
  if (!container) return;

  if (!list || list.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted); font-size:13px;">Zatím nejsou uloženy žádné vlastní filtry. Prvky můžete zablokovat přímo na stránce přes pravé tlačítko myši nebo ikonu Browsy Shields.</div>';
    return;
  }

  container.innerHTML = list.map((rule, idx) => `
    <div class="list-row">
      <span class="code-tag" style="word-break:break-all;">${escapeHtml(rule)}</span>
      <button class="btn btn-danger" data-rule-idx="${idx}">Smazat</button>
    </div>
  `).join('');

  container.querySelectorAll('button[data-rule-idx]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.getAttribute('data-rule-idx'), 10);
      const targetRule = list[idx];
      if (targetRule && api.removeCustomFilter) {
        const updated = await api.removeCustomFilter(targetRule);
        renderCustomFilters(updated);
      }
    });
  });
}

document.getElementById('btn-add-custom-filter')?.addEventListener('click', async () => {
  const input = document.getElementById('input-custom-filter');
  const val = input ? input.value.trim() : '';
  if (val && api.addCustomFilter) {
    const updated = await api.addCustomFilter(val);
    input.value = '';
    renderCustomFilters(updated);
  }
});

document.getElementById('input-custom-filter')?.addEventListener('keydown', async (e) => {
  if (e.key === 'Enter') {
    document.getElementById('btn-add-custom-filter')?.click();
  }
});

document.getElementById('btn-save-bulk-filters')?.addEventListener('click', async () => {
  const textarea = document.getElementById('textarea-custom-filters');
  if (!textarea || !api.setCustomFilters) return;
  const lines = textarea.value.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const updated = await api.setCustomFilters(lines);
  renderCustomFilters(updated);
  const btn = document.getElementById('btn-save-bulk-filters');
  if (btn) {
    const orig = btn.textContent;
    btn.textContent = '✔ Uloženo';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  }
});

// Whitelist Shields
function renderShieldsWhitelist(list) {
  const container = document.getElementById('shields-whitelist-list');
  if (!container) return;

  if (list.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted); font-size:13px;">Žádné domény nejsou na whitelistu.</div>';
    return;
  }

  container.innerHTML = list.map(domain => `
    <div class="list-row">
      <span>${escapeHtml(domain)}</span>
      <button class="btn btn-danger" onclick="removeShieldWhitelist('${escapeHtml(domain)}')">Odebrat</button>
    </div>
  `).join('');
}

window.removeShieldWhitelist = async (domain) => {
  await api.toggleShieldsWhitelist(domain);
  const s = await api.getSettings();
  renderShieldsWhitelist(s.shieldsWhitelist || []);
};

document.getElementById('btn-add-whitelist-shield')?.addEventListener('click', async () => {
  const input = document.getElementById('input-whitelist-shield');
  const val = input.value.trim().toLowerCase();
  if (val) {
    await api.toggleShieldsWhitelist(val);
    input.value = '';
    const s = await api.getSettings();
    renderShieldsWhitelist(s.shieldsWhitelist || []);
  }
});

// Whitelist Popups
function renderPopupsWhitelist(list) {
  const container = document.getElementById('popups-whitelist-list');
  if (!container) return;

  if (list.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted); font-size:13px;">Žádné weby nemají povolená vyskakovací okna.</div>';
    return;
  }

  container.innerHTML = list.map(domain => `
    <div class="list-row">
      <span>${escapeHtml(domain)}</span>
      <button class="btn btn-danger" onclick="removePopupWhitelist('${escapeHtml(domain)}')">Odebrat</button>
    </div>
  `).join('');
}

window.removePopupWhitelist = async (domain) => {
  await api.togglePopupWhitelist(domain);
  const s = await api.getSettings();
  renderPopupsWhitelist(s.popupWhitelist || []);
};

document.getElementById('btn-add-whitelist-popup')?.addEventListener('click', async () => {
  const input = document.getElementById('input-whitelist-popup');
  const val = input.value.trim().toLowerCase();
  if (val) {
    await api.togglePopupWhitelist(val);
    input.value = '';
    const s = await api.getSettings();
    renderPopupsWhitelist(s.popupWhitelist || []);
  }
});

// Snippets
function renderSnippets(list) {
  const container = document.getElementById('snippets-list');
  if (!container) return;

  if (list.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted); font-size:13px;">Žádné zkratky nejsou definovány.</div>';
    return;
  }

  container.innerHTML = list.map(s => `
    <div class="list-row">
      <div style="display:flex; gap:12px; align-items:center;">
        <span class="code-tag">${escapeHtml(s.trigger)}</span>
        <strong style="font-size:13px;">${escapeHtml(s.label || s.trigger)}</strong>
        <span style="color:var(--text-muted); font-size:12px; max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(s.replacement)}</span>
      </div>
      <button class="btn btn-danger" onclick="deleteSnippet('${s.id}')">Smazat</button>
    </div>
  `).join('');
}

window.deleteSnippet = async (id) => {
  await api.deleteSnippet(id);
  const snippets = await api.getSnippets();
  renderSnippets(snippets || []);
};

document.getElementById('btn-add-snippet')?.addEventListener('click', async () => {
  const trigger = document.getElementById('new-snippet-trigger').value.trim();
  const label = document.getElementById('new-snippet-label').value.trim();
  const replacement = document.getElementById('new-snippet-replacement').value;

  if (trigger && replacement) {
    await api.addSnippet(trigger, replacement, label);
    document.getElementById('new-snippet-trigger').value = '';
    document.getElementById('new-snippet-label').value = '';
    document.getElementById('new-snippet-replacement').value = '';
    const snippets = await api.getSnippets();
    renderSnippets(snippets || []);
  }
});

// Extensions Actions
document.getElementById('btn-install-ext')?.addEventListener('click', async () => {
  await api.pickAndInstallExtension();
});

document.getElementById('btn-open-extensions-page')?.addEventListener('click', () => {
  window.location.href = 'browsy://extensions';
});

// -------------------------------------------------------------
// Cloud & Self-Hosted Sync
// -------------------------------------------------------------
const providerSelect = document.getElementById('sync-provider-select');
const syncFields = document.getElementById('sync-settings-fields');
const serverUrlInput = document.getElementById('sync-server-url');
const usernameWrap = document.getElementById('sync-username-wrap');
const usernameInput = document.getElementById('sync-username');
const tokenInput = document.getElementById('sync-token');
const tokenLabel = document.getElementById('sync-token-label');
const passphraseInput = document.getElementById('sync-passphrase');
const syncStatusMsg = document.getElementById('sync-status-msg');

function showSyncStatus(msg, isError = false) {
  if (!syncStatusMsg) return;
  syncStatusMsg.style.display = 'block';
  syncStatusMsg.style.background = isError ? '#271515' : '#142718';
  syncStatusMsg.style.border = `1px solid ${isError ? '#7f1d1d' : '#166534'}`;
  syncStatusMsg.style.color = isError ? '#f87171' : '#4ade80';
  syncStatusMsg.textContent = msg;
}

function updateSyncUI(provider) {
  if (!syncFields) return;
  if (provider === 'NONE') {
    syncFields.style.display = 'none';
  } else {
    syncFields.style.display = 'flex';
    if (provider === 'WEBDAV') {
      if (usernameWrap) usernameWrap.style.display = 'block';
      if (tokenLabel) tokenLabel.textContent = 'Heslo nebo App Token pro WebDAV';
      if (serverUrlInput && !serverUrlInput.value) {
        serverUrlInput.placeholder = 'https://nextcloud.example.com/remote.php/dav/files/uzivatel/';
      }
    } else {
      if (usernameWrap) usernameWrap.style.display = 'none';
      if (tokenLabel) tokenLabel.textContent = 'Přístupový token serveru (Master Token)';
      if (serverUrlInput && !serverUrlInput.value) {
        serverUrlInput.placeholder = 'http://192.168.1.50:8080 nebo https://sync.example.com';
      }
    }
  }
}

providerSelect?.addEventListener('change', (e) => {
  updateSyncUI(e.target.value);
});

async function loadSyncSettings() {
  if (!api || !api.getSyncConfig) return;
  try {
    const config = await api.getSyncConfig();
    if (providerSelect) providerSelect.value = config.provider || 'NONE';
    if (serverUrlInput) serverUrlInput.value = config.serverUrl || '';
    if (usernameInput) usernameInput.value = config.username || '';
    if (tokenInput) tokenInput.value = config.token || '';
    if (passphraseInput) passphraseInput.value = config.passphrase || '';
    updateSyncUI(config.provider || 'NONE');

    if (config.lastSyncTime && config.lastSyncTime > 0) {
      const dateStr = new Date(config.lastSyncTime).toLocaleString('cs-CZ');
      showSyncStatus(`Poslední úspěšná synchronizace: ${dateStr}`, false);
    }
  } catch (err) {
    console.error('Failed to load sync settings:', err);
  }
}

function getSyncFormConfig() {
  const provider = providerSelect ? providerSelect.value : 'NONE';
  return {
    enabled: provider !== 'NONE',
    provider,
    serverUrl: serverUrlInput ? serverUrlInput.value.trim() : '',
    username: usernameInput ? usernameInput.value.trim() : '',
    token: tokenInput ? tokenInput.value.trim() : '',
    passphrase: passphraseInput ? passphraseInput.value : '',
    autoSync: true
  };
}

document.getElementById('btn-sync-test')?.addEventListener('click', async () => {
  const config = getSyncFormConfig();
  showSyncStatus('Testuji připojení k serveru...', false);
  try {
    const res = await api.testSyncConnection(config);
    if (res.success) {
      showSyncStatus(`✔ Připojení úspěšné: ${res.message || 'Spojení navázáno'}`, false);
    } else {
      showSyncStatus(`✖ Chyba spojení: ${res.error || 'Neznámá chyba'}`, true);
    }
  } catch (err) {
    showSyncStatus(`✖ Chyba spojení: ${err.message}`, true);
  }
});

document.getElementById('btn-sync-save')?.addEventListener('click', async () => {
  const config = getSyncFormConfig();
  try {
    await api.saveSyncConfig(config);
    showSyncStatus('✔ Nastavení synchronizace bylo úspěšně uloženo', false);
  } catch (err) {
    showSyncStatus(`✖ Chyba ukládání: ${err.message}`, true);
  }
});

document.getElementById('btn-sync-now')?.addEventListener('click', async () => {
  const config = getSyncFormConfig();
  if (!config.passphrase) {
    showSyncStatus('✖ Zadejte bezpečnostní frázi (Passphrase) pro šifrování dat.', true);
    return;
  }
  showSyncStatus('Probíhá E2EE synchronizace...', false);
  try {
    // Save config first
    await api.saveSyncConfig(config);
    const res = await api.syncNow(config);
    if (res.success) {
      const dateStr = new Date(res.lastSyncTime).toLocaleTimeString('cs-CZ');
      showSyncStatus(`✔ Synchronizace dokončena v ${dateStr} (záložek: ${res.bookmarksCount}, historie: ${res.historyCount}, filtrů: ${res.filtersCount})`, false);
    } else {
      showSyncStatus(`✖ Chyba synchronizace: ${res.error}`, true);
    }
  } catch (err) {
    showSyncStatus(`✖ Chyba synchronizace: ${err.message}`, true);
  }
});

// Profile Backup / Offline Export
document.getElementById('btn-export-profile')?.addEventListener('click', async () => {
  try {
    const res = await api.exportProfile();
    if (res.success) {
      alert(`Profil byl úspěšně exportován do:\n${res.filePath}`);
    }
  } catch (err) {
    alert(`Chyba exportu profilu: ${err.message}`);
  }
});

document.getElementById('btn-import-profile')?.addEventListener('click', async () => {
  try {
    const res = await api.importProfile();
    if (res.success) {
      alert('Profil byl úspěšně obnoven ze zálohy.');
      window.location.reload();
    }
  } catch (err) {
    alert(`Chyba importu profilu: ${err.message}`);
  }
});

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag] || tag));
}

// Open external links in a new tab instead of window
document.addEventListener('click', (e) => {
  const link = e.target.closest('a[href^="http"]');
  if (link) {
    e.preventDefault();
    if (api && api.createTab) {
      api.createTab(link.href);
    } else {
      window.location.href = link.href;
    }
  }
});

loadAllSettings();
loadSyncSettings();
