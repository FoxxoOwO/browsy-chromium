const { ipcRenderer, contextBridge } = require('electron');

// Internal API exposure for browsy:// local files
if (window.location.protocol === 'file:') {
  if (window.location.pathname.includes('extensions.html')) {
    contextBridge.exposeInMainWorld('browsyExtAPI', {
      getAll: () => ipcRenderer.invoke('extensions:get-all'),
      install: () => ipcRenderer.invoke('extensions:pick-install'),
      toggle: (id, enabled) => ipcRenderer.invoke('extensions:toggle', id, enabled),
      remove: (id) => ipcRenderer.invoke('extensions:remove', id),
      createTab: (url) => ipcRenderer.invoke('tabs:create', url)
    });
  }
  if (window.location.pathname.includes('settings.html')) {
    contextBridge.exposeInMainWorld('browsyAPI', {
      createTab: (url) => ipcRenderer.invoke('tabs:create', url),
      getSettings: () => ipcRenderer.invoke('settings:get-all'),
      setSetting: (key, val) => ipcRenderer.invoke('settings:set', key, val),
      setLayoutMode: (mode) => ipcRenderer.invoke('layout:set-mode', mode),
      toggleShields: (enabled) => ipcRenderer.invoke('shields:toggle-enabled', enabled),
      togglePopupBlocker: (enabled) => ipcRenderer.invoke('popup:toggle-enabled', enabled),
      getSnippets: () => ipcRenderer.invoke('expander:get-snippets'),
      addSnippet: (trigger, replacement, label) => ipcRenderer.invoke('expander:add-snippet', trigger, replacement, label),
      updateSnippet: (id, trigger, replacement, label) => ipcRenderer.invoke('expander:update-snippet', id, trigger, replacement, label),
      deleteSnippet: (id) => ipcRenderer.invoke('expander:delete-snippet', id),
      toggleExpander: (enabled) => ipcRenderer.invoke('expander:toggle-enabled', enabled),
      pickAndInstallExtension: () => ipcRenderer.invoke('extensions:pick-install')
    });
  }
}

/**
 * Browsy Chromium Content Preload
 * Injected into web pages to handle Text Expansion, Video Detection, Popup Guard,
 * and seamless Extension Store Integrations (Chrome Web Store, Opera Add-ons, Firefox AMO).
 */

// -------------------------------------------------------------
// 1. Text Expander Engine
// -------------------------------------------------------------
let expanderEnabled = true;
let expanderSnippets = [];
let keyBuffer = '';
const BUFFER_MAX = 40;

ipcRenderer.on('browsy:update-expander', (event, { enabled, snippets }) => {
  expanderEnabled = enabled;
  expanderSnippets = snippets || [];
});

ipcRenderer.invoke('browsy:get-expander-config').then(cfg => {
  if (cfg) {
    expanderEnabled = cfg.enabled;
    expanderSnippets = cfg.snippets || [];
  }
}).catch(() => {});

function formatVariables(text) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('cs-CZ');
  const timeStr = now.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
  const yearStr = now.getFullYear().toString();
  return text
    .replace(/{date}/gi, dateStr)
    .replace(/{time}/gi, timeStr)
    .replace(/{year}/gi, yearStr);
}

document.addEventListener('keydown', (e) => {
  if (!expanderEnabled || expanderSnippets.length === 0) return;

  if (['Escape', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    keyBuffer = '';
    return;
  }

  if (e.key === 'Backspace') {
    keyBuffer = keyBuffer.slice(0, -1);
    return;
  }

  if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    keyBuffer += e.key;
    if (keyBuffer.length > BUFFER_MAX) {
      keyBuffer = keyBuffer.slice(-BUFFER_MAX);
    }

    for (const snippet of expanderSnippets) {
      const trigger = snippet.trigger;
      if (trigger && keyBuffer.endsWith(trigger)) {
        expandSnippet(snippet, e.target);
        keyBuffer = '';
        break;
      }
    }
  }
}, true);

function expandSnippet(snippet, target) {
  if (!target) return;
  const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
  const isEditable = target.isContentEditable;

  if (!isInput && !isEditable) return;

  const triggerLen = snippet.trigger.length;
  const replacement = formatVariables(snippet.replacement);

  if (isInput) {
    const start = target.selectionStart;
    const end = target.selectionEnd;
    if (start !== null && end !== null && start >= triggerLen) {
      const currentVal = target.value;
      const typedTrigger = currentVal.substring(start - triggerLen, start);
      if (typedTrigger === snippet.trigger) {
        target.setSelectionRange(start - triggerLen, start);
        document.execCommand('insertText', false, replacement);
        if (target.value.substring(start - triggerLen, start) === snippet.trigger) {
          const newVal = currentVal.substring(0, start - triggerLen) + replacement + currentVal.substring(start);
          target.value = newVal;
          target.setSelectionRange(start - triggerLen + replacement.length, start - triggerLen + replacement.length);
          target.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    }
  } else if (isEditable) {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      for (let i = 0; i < triggerLen; i++) {
        document.execCommand('delete', false, null);
      }
      document.execCommand('insertText', false, replacement);
    }
  }
}

// -------------------------------------------------------------
// 2. DOM Video & Media Detector
// -------------------------------------------------------------
const reportedUrls = new Set();

function inspectMediaElements() {
  const videos = Array.from(document.querySelectorAll('video'));
  const audios = Array.from(document.querySelectorAll('audio'));

  [...videos, ...audios].forEach((el) => {
    let src = el.currentSrc || el.src;
    if (!src) {
      const source = el.querySelector('source');
      if (source) src = source.src;
    }

    if (src && !reportedUrls.has(src) && !src.startsWith('blob:http') && !src.startsWith('data:')) {
      reportedUrls.add(src);

      const isVideo = el.tagName === 'VIDEO';
      const resolution = isVideo && el.videoWidth ? `${el.videoWidth}x${el.videoHeight}` : '';
      const duration = el.duration && !isNaN(el.duration) ? formatDuration(el.duration) : '';
      const pageTitle = document.title || 'Video';

      ipcRenderer.send('browsy:video-detected', {
        url: src,
        title: pageTitle,
        format: isVideo ? 'MP4 / Web Video' : 'Audio',
        resolution: resolution,
        duration: duration,
        size: 'Detekováno ze stránky'
      });
    }
  });
}

function formatDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

window.addEventListener('DOMContentLoaded', () => {
  inspectMediaElements();
  const observer = new MutationObserver(() => {
    inspectMediaElements();
  });
  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true
  });
});

document.addEventListener('play', (e) => {
  if (e.target.tagName === 'VIDEO' || e.target.tagName === 'AUDIO') {
    inspectMediaElements();
  }
}, true);

// -------------------------------------------------------------
// 3. Web Extension Store Integrations (Chrome, Opera, Firefox)
// -------------------------------------------------------------
function setupStoreIntegration() {
  const href = window.location.href;

  // 1. Chrome Web Store
  const chromeMatch = href.match(/(?:chromewebstore\.google\.com|chrome\.google\.com\/webstore)\/detail\/(?:[^\/]+\/)?([a-p]{32})/i);
  if (chromeMatch) {
    const extId = chromeMatch[1].toLowerCase();
    setupChromeStore(extId);
    injectStoreFloatingBar('chrome', extId, 'Chrome Web Store');
    return;
  }

  // 2. Opera Add-ons
  const operaMatch = href.match(/addons\.opera\.com\/(?:[a-zA-Z-]+\/)?extensions\/details\/([a-zA-Z0-9_-]+)/i);
  if (operaMatch) {
    const slug = operaMatch[1];
    setupOperaStore(slug);
    injectStoreFloatingBar('opera', slug, 'Opera Add-ons');
    return;
  }

  // 3. Firefox Add-ons (AMO)
  const firefoxMatch = href.match(/addons\.mozilla\.org\/(?:[a-zA-Z-]+\/)?firefox\/addon\/([a-zA-Z0-9_-]+)/i);
  if (firefoxMatch) {
    const slug = firefoxMatch[1];
    setupAmoStore(slug);
    injectStoreFloatingBar('firefox', slug, 'Firefox Add-ons');
    return;
  }
}

// -------------------------------------------------------------
// Chrome Web Store Enhancer
// -------------------------------------------------------------
function setupChromeStore(extId) {
  // Inject style to suppress "Install Google Chrome" nag banners
  const style = document.createElement('style');
  style.textContent = `
    [aria-label*="Google Chrome"][role="region"],
    .F9iHWe,
    div:has(> a[href*="google.com/chrome"]) {
      display: none !important;
    }
  `;
  document.head ? document.head.appendChild(style) : document.documentElement.appendChild(style);

  const enhanceButtons = () => {
    // Hide nag messages in DOM
    const nagDivs = document.querySelectorAll('div, section, aside');
    nagDivs.forEach(el => {
      if (el.children.length <= 4) {
        const txt = el.textContent || '';
        if (txt.includes('Používáte jiný prohlížeč') || txt.includes('Stáhněte si Google Chrome') || txt.includes('K instalaci rozšíření je nutný Chrome')) {
          el.style.display = 'none';
        }
      }
    });

    // Find CWS Action Button (Add to Chrome / Available on Chrome / etc.)
    const buttons = document.querySelectorAll('button');
    buttons.forEach(btn => {
      const txt = (btn.textContent || '').trim().toLowerCase();
      const isTarget = txt.includes('přidat do chromu') || txt.includes('add to chrome') ||
                       txt.includes('k dispozici v chromu') || txt.includes('available on chrome') ||
                       txt.includes('přidat do prohlížeče');

      if (isTarget && !btn.dataset.browsyEnhanced) {
        btn.dataset.browsyEnhanced = 'true';
        btn.disabled = false;
        btn.removeAttribute('aria-disabled');

        const span = btn.querySelector('span[jsname="V67aGc"]') || btn.querySelector('span') || btn;
        span.textContent = '＋ Přidat do Browsy';
        btn.classList.add('browsy-cws-btn');
        btn.style.cursor = 'pointer';
        btn.style.opacity = '1';

        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          span.textContent = 'Instaluji do Browsy...';
          installExtension('chrome', extId, document.title);
        }, true);
      }
    });
  };

  enhanceButtons();
  const obs = new MutationObserver(enhanceButtons);
  obs.observe(document.body || document.documentElement, { childList: true, subtree: true });
}

// -------------------------------------------------------------
// Opera Add-ons Enhancer
// -------------------------------------------------------------
function setupOperaStore(slug) {
  // Inject style to suppress Opera browser required notices
  const style = document.createElement('style');
  style.textContent = `
    .get-opera, .get-opera-small, .get-opera-title, .get-opera-link, [class*="get-opera"],
    a[href*="opera.com/download"], a[href*="opera.com/computer"],
    .sidebar .get-opera {
      display: none !important;
    }
  `;
  document.head ? document.head.appendChild(style) : document.documentElement.appendChild(style);

  const enhanceButtons = () => {
    const installBtns = document.querySelectorAll('.btn-install, a[data-url*="/extensions/download/"], a[href*="/extensions/download/"]');
    installBtns.forEach(btn => {
      if (!btn.dataset.browsyEnhanced) {
        btn.dataset.browsyEnhanced = 'true';
        const span = btn.querySelector('span') || btn;
        span.textContent = '＋ Přidat do Browsy';
        btn.classList.add('browsy-opera-btn');
        btn.style.cursor = 'pointer';

        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          span.textContent = 'Instaluji do Browsy...';
          installExtension('opera', slug, document.title);
        }, true);
      }
    });

    // Fallback if .btn-install wasn't rendered by Opera
    const wrapper = document.querySelector('.wrapper-install') || document.querySelector('.sidebar');
    if (wrapper && !document.querySelector('.btn-install') && !document.getElementById('browsy-opera-direct-btn')) {
      const customBtn = document.createElement('button');
      customBtn.id = 'browsy-opera-direct-btn';
      customBtn.className = 'btn-install btn-with-plus browsy-opera-btn';
      customBtn.textContent = '＋ Přidat do Browsy';
      customBtn.style.cssText = `
        display: block;
        width: 100%;
        padding: 12px 20px;
        background: #09090b;
        color: #f4f4f5;
        border: 1px solid #3f3f46;
        border-radius: 8px;
        font-weight: 600;
        font-size: 14px;
        cursor: pointer;
        margin: 12px 0;
        text-align: center;
      `;
      customBtn.onclick = (e) => {
        e.preventDefault();
        customBtn.textContent = 'Instaluji do Browsy...';
        installExtension('opera', slug, document.title);
      };
      wrapper.prepend(customBtn);
    }
  };

  enhanceButtons();
  const obs = new MutationObserver(enhanceButtons);
  obs.observe(document.body || document.documentElement, { childList: true, subtree: true });
}

// -------------------------------------------------------------
// Firefox Add-ons (AMO) Enhancer
// -------------------------------------------------------------
function setupAmoStore(slug) {
  // Inject style to suppress "Only with Firefox / Get Firefox" nag banners
  const style = document.createElement('style');
  style.textContent = `
    .Addon-get-firefox-message,
    .AMOBanner--get-firefox,
    .Addon-get-firefox > p,
    a.GetFirefoxButton,
    a[href*="firefox/new"],
    .Addon-get-firefox-link,
    .PromotedBadge__help-link {
      display: none !important;
    }
    .Addon-get-firefox {
      background: transparent !important;
      border: none !important;
      padding: 0 !important;
      margin: 0 !important;
    }
  `;
  document.head ? document.head.appendChild(style) : document.documentElement.appendChild(style);

  const enhanceButtons = () => {
    const container = document.querySelector('.InstallButtonWrapper') ||
                      document.querySelector('.Addon-get-firefox') ||
                      document.querySelector('.AMOMeta-install') ||
                      document.querySelector('.Addon-header-controls');

    // Intercept existing GetFirefoxButton or links to firefox/new
    const getFxBtns = document.querySelectorAll('a.GetFirefoxButton, a[href*="firefox/new"]');
    getFxBtns.forEach(btn => {
      if (!btn.dataset.browsyEnhanced) {
        btn.dataset.browsyEnhanced = 'true';
        btn.textContent = '＋ Přidat do Browsy';
        btn.removeAttribute('href');
        btn.style.cursor = 'pointer';
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          btn.textContent = 'Stahuji a instaluji...';
          installExtension('firefox', slug, document.title);
        }, true);
      }
    });

    if (container && !document.getElementById('browsy-amo-btn')) {
      const btn = document.createElement('button');
      btn.id = 'browsy-amo-btn';
      btn.className = 'browsy-amo-btn';
      btn.textContent = '＋ Přidat do Browsy';
      btn.style.cssText = `
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        background: #09090b;
        color: #f4f4f5;
        border: 1px solid #3f3f46;
        padding: 12px 28px;
        border-radius: 8px;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        margin: 12px 0;
        width: 100%;
        box-sizing: border-box;
        box-shadow: 0 4px 16px rgba(0,0,0,0.5);
        transition: all 0.2s ease;
      `;
      btn.onmouseenter = () => { btn.style.background = '#18181b'; btn.style.borderColor = '#71717a'; };
      btn.onmouseleave = () => { btn.style.background = '#09090b'; btn.style.borderColor = '#3f3f46'; };
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.textContent = 'Stahuji a instaluji...';
        btn.disabled = true;
        installExtension('firefox', slug, document.title);
      };

      container.prepend(btn);
    }
  };

  enhanceButtons();
  const obs = new MutationObserver(enhanceButtons);
  obs.observe(document.body || document.documentElement, { childList: true, subtree: true });
}

// -------------------------------------------------------------
// Floating Quick Action Banner
// -------------------------------------------------------------
function injectStoreFloatingBar(store, id, storeName) {
  if (document.getElementById('browsy-store-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'browsy-store-banner';
  banner.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: #09090b;
    color: #f4f4f5;
    border: 1px solid #27272a;
    border-radius: 12px;
    padding: 12px 18px;
    display: flex;
    align-items: center;
    gap: 16px;
    box-shadow: 0 12px 36px rgba(0,0,0,0.6);
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 13px;
    user-select: none;
    backdrop-filter: blur(12px);
  `;

  banner.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px;">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f4f4f5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/>
        <rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>
      </svg>
      <div>
        <div style="font-weight:600; color:#fff;">Browsy Extension Installer</div>
        <div style="font-size:11px; color:#8b8e9b;">Doplněk z ${storeName}</div>
      </div>
    </div>
    <button id="browsy-btn-store-install" style="
      background: #f4f4f5;
      color: #09090b;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 12px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: background 0.15s ease;
    ">
      <span>Přidat do Browsy</span>
    </button>
    <button id="browsy-btn-store-dismiss" style="
      background: transparent;
      border: none;
      color: #71717a;
      font-size: 18px;
      cursor: pointer;
      padding: 0 4px;
      line-height: 1;
    ">&times;</button>
  `;

  document.body.appendChild(banner);

  document.getElementById('browsy-btn-store-dismiss').onclick = () => banner.remove();
  document.getElementById('browsy-btn-store-install').onclick = () => installExtension(store, id, document.title);
}

// -------------------------------------------------------------
// Unified Extension Installer
// -------------------------------------------------------------
async function installExtension(store, id, title) {
  // Update all in-page and floating buttons to installing state
  const floatingBtn = document.getElementById('browsy-btn-store-install');
  if (floatingBtn) {
    floatingBtn.textContent = 'Instaluji...';
    floatingBtn.disabled = true;
  }
  const amoBtn = document.getElementById('browsy-amo-btn');
  if (amoBtn) {
    amoBtn.textContent = 'Stahuji a instaluji...';
    amoBtn.disabled = true;
  }
  const operaBtn = document.getElementById('browsy-opera-direct-btn') || document.querySelector('.browsy-opera-btn');
  if (operaBtn) {
    operaBtn.textContent = 'Instaluji do Browsy...';
  }
  const cwsBtn = document.querySelector('.browsy-cws-btn');
  if (cwsBtn) {
    const span = cwsBtn.querySelector('span[jsname="V67aGc"]') || cwsBtn.querySelector('span') || cwsBtn;
    span.textContent = 'Instaluji do Browsy...';
  }

  try {
    const res = await ipcRenderer.invoke('extensions:install-from-store', store, id, title);
    if (res.success) {
      if (floatingBtn) floatingBtn.textContent = '✔ Nainstalováno!';
      if (amoBtn) {
        amoBtn.textContent = '✔ Úspěšně nainstalováno!';
        amoBtn.style.background = '#27272a';
      }
      if (operaBtn) {
        const span = operaBtn.querySelector('span') || operaBtn;
        span.textContent = '✔ Nainstalováno v Browsy';
      }
      if (cwsBtn) {
        const span = cwsBtn.querySelector('span[jsname="V67aGc"]') || cwsBtn.querySelector('span') || cwsBtn;
        span.textContent = '✔ Nainstalováno v Browsy';
      }
      setTimeout(() => {
        const banner = document.getElementById('browsy-store-banner');
        if (banner) banner.remove();
      }, 3000);
      return res;
    } else {
      alert('Chyba při instalaci doplňku: ' + (res.error || 'Neznámá chyba'));
      resetButtonStates();
      return res;
    }
  } catch (e) {
    alert('Chyba: ' + e.message);
    resetButtonStates();
    throw e;
  }
}

function resetButtonStates() {
  const floatingBtn = document.getElementById('browsy-btn-store-install');
  if (floatingBtn) { floatingBtn.textContent = 'Přidat do Browsy'; floatingBtn.disabled = false; }
  const amoBtn = document.getElementById('browsy-amo-btn');
  if (amoBtn) { amoBtn.textContent = '＋ Přidat do Browsy'; amoBtn.disabled = false; }
  const operaBtn = document.getElementById('browsy-opera-direct-btn') || document.querySelector('.browsy-opera-btn');
  if (operaBtn) {
    const span = operaBtn.querySelector('span') || operaBtn;
    span.textContent = '＋ Přidat do Browsy';
  }
  const cwsBtn = document.querySelector('.browsy-cws-btn');
  if (cwsBtn) {
    const span = cwsBtn.querySelector('span[jsname="V67aGc"]') || cwsBtn.querySelector('span') || cwsBtn;
    span.textContent = '＋ Přidat do Browsy';
  }
}

window.addEventListener('DOMContentLoaded', setupStoreIntegration);
