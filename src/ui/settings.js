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

  // Popups Whitelist
  renderPopupsWhitelist(settings.popupWhitelist || []);

  // Snippets
  const snippets = await api.getSnippets();
  renderSnippets(snippets || []);
}

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

loadAllSettings();
