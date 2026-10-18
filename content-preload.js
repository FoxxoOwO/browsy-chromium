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
      getCustomFilters: () => ipcRenderer.invoke('shields:get-custom-filters'),
      addCustomFilter: (rule) => ipcRenderer.invoke('shields:add-custom-filter', rule),
      removeCustomFilter: (rule) => ipcRenderer.invoke('shields:remove-custom-filter', rule),
      setCustomFilters: (rules) => ipcRenderer.invoke('shields:set-custom-filters', rules),
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

function debounce(fn, waitMs) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, waitMs);
  };
}

// Never carry typed characters over to another element
document.addEventListener('focusin', () => { keyBuffer = ''; }, true);
document.addEventListener('mousedown', () => { keyBuffer = ''; }, true);

document.addEventListener('keydown', (e) => {
  if (!expanderEnabled || expanderSnippets.length === 0) return;

  // Never record or expand anything typed into password fields
  const t = e.target;
  if (t && t.tagName === 'INPUT' && (t.type === 'password')) {
    keyBuffer = '';
    return;
  }

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
  const observer = new MutationObserver(debounce(inspectMediaElements, 600));
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
  const obs = new MutationObserver(debounce(enhanceButtons, 250));
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
  const obs = new MutationObserver(debounce(enhanceButtons, 250));
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
  const obs = new MutationObserver(debounce(enhanceButtons, 250));
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

// -------------------------------------------------------------
// 4. Browsy Shields: Cosmetic Filter Engine & Element Picker / Zapper
// -------------------------------------------------------------
const COSMETIC_STYLE_ID = 'browsy-cosmetic-filters';

function whenDocumentElementReady(callback) {
  if (document.documentElement) {
    callback();
    return;
  }
  // Preload scripts run before the document element exists - wait for it without polling
  const obs = new MutationObserver(() => {
    if (document.documentElement) {
      obs.disconnect();
      callback();
    }
  });
  obs.observe(document, { childList: true });
}

function applyCosmeticSelectors(selectors) {
  if (!Array.isArray(selectors)) return;

  whenDocumentElementReady(() => {
    let styleEl = document.getElementById(COSMETIC_STYLE_ID);

    if (selectors.length === 0) {
      if (styleEl) styleEl.textContent = '';
      return;
    }

    // Validate selectors individually so one invalid custom selector doesn't break the whole stylesheet
    const validRules = [];
    for (const sel of selectors) {
      if (!sel || typeof sel !== 'string') continue;
      try {
        document.querySelector(sel);
        validRules.push(`${sel} { display: none !important; }`);
      } catch (e) {
        // Skip malformed CSS selector
      }
    }

    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = COSMETIC_STYLE_ID;
      (document.head || document.documentElement).appendChild(styleEl);
    }
    styleEl.textContent = validRules.join('\n');
  });
}

function initCosmeticFilters() {
  if (window.location.protocol !== 'http:' && window.location.protocol !== 'https:') return;
  ipcRenderer.invoke('shields:get-cosmetic-filters', window.location.href)
    .then(selectors => {
      if (selectors) applyCosmeticSelectors(selectors);
    })
    .catch(() => {});
}

// Start right away - the IPC round trip overlaps with page parsing so rules are usually
// applied before the first paint.
initCosmeticFilters();

ipcRenderer.on('browsy:cosmetic-filters-updated', (event, selectors) => {
  applyCosmeticSelectors(selectors);
});

// -------------------------------------------------------------
// Interactive Element Zapper (Temporary) & Element Picker (Permanent)
// -------------------------------------------------------------
let pickerActive = false;
let pickerMode = 'permanent'; // 'temporary' | 'permanent'
let pickerLocked = false;
let hoveredElement = null;
let selectedElement = null;
let childHistoryStack = []; // for walking down after walking up to parent
let zappedHistory = []; // [{ el, prevDisplay, prevVisibility }]
let scopeMode = 'domain'; // 'domain' | 'global'
let previewActive = false;
let currentSelector = '';

let overlayRoot = null;
let highlightBox = null;
let highlightLabel = null;
let topZapperBar = null;
let pickerDialog = null;
let previewStyleEl = null;

function isBrowsyOverlayElement(el) {
  if (!el) return true;
  if (el.id === 'browsy-picker-root' || el.id === 'browsy-store-banner' || el.id === COSMETIC_STYLE_ID || el.id === 'browsy-picker-preview-style') {
    return true;
  }
  if (el.closest && el.closest('#browsy-picker-root')) {
    return true;
  }
  return false;
}

function generateSmartSelector(el) {
  if (!el || el === document.body || el === document.documentElement) return '';

  // 1. Check for clean ID (not overly random/numeric)
  if (el.id && typeof el.id === 'string') {
    const id = el.id.trim();
    if (id && !/^\d/.test(id) && !/[0-9a-f]{8,}/i.test(id)) {
      try {
        const escaped = CSS.escape(id);
        return `#${escaped}`;
      } catch (e) {}
    }
  }

  // 2. Check for semantic ad/component attributes (only if they identify the element almost uniquely)
  const priorityAttrs = ['data-ad', 'data-ad-slot', 'data-ad-unit', 'data-testid', 'data-component', 'data-widget'];
  for (const attr of priorityAttrs) {
    const val = el.getAttribute(attr);
    if (val && val.length < 60 && !val.includes('"') && !val.includes('\\')) {
      const candidate = `${el.tagName.toLowerCase()}[${attr}="${val}"]`;
      try {
        const matches = document.querySelectorAll(candidate);
        if (matches.length >= 1 && matches.length <= 3 && Array.from(matches).includes(el)) {
          return candidate;
        }
      } catch (e) {}
    }
  }

  // 3. Build path using stable classes or structural hierarchy
  const getElementSegment = (node) => {
    const tag = node.tagName.toLowerCase();
    if (node.id && typeof node.id === 'string' && !/^\d/.test(node.id) && !/[0-9a-f]{8,}/i.test(node.id)) {
      return `#${CSS.escape(node.id)}`;
    }

    const classes = Array.from(node.classList || []).filter(c => {
      if (!c || c.length < 2 || c.length > 40) return false;
      if (c.startsWith('browsy-')) return false;
      // Filter out likely utility/hash classes
      if (/^(css|sc|jsx|svelte)-[a-z0-9]+$/i.test(c)) return false;
      if (/[0-9a-f]{6,}/i.test(c)) return false;
      return true;
    });

    if (classes.length > 0) {
      const clsSelector = classes.slice(0, 3).map(c => `.${CSS.escape(c)}`).join('');
      return `${tag}${clsSelector}`;
    }
    return tag;
  };

  const singleSeg = getElementSegment(el);
  try {
    const count = document.querySelectorAll(singleSeg).length;
    if (count === 1 || (singleSeg.includes('.') && count <= 5)) {
      return singleSeg;
    }
  } catch (e) {}

  // Walk up up to 3 levels to build a unique-ish selector
  const parts = [];
  let cur = el;
  let depth = 0;
  while (cur && cur !== document.body && cur !== document.documentElement && depth < 3) {
    let seg = getElementSegment(cur);
    const parent = cur.parentElement;
    if (parent && !seg.startsWith('#')) {
      const siblings = Array.from(parent.children).filter(ch => ch.tagName === cur.tagName);
      if (siblings.length > 1) {
        const idx = siblings.indexOf(cur) + 1;
        seg += `:nth-of-type(${idx})`;
      }
    }
    parts.unshift(seg);
    const candidate = parts.join(' > ');
    try {
      if (document.querySelectorAll(candidate).length === 1) {
        return candidate;
      }
    } catch (e) {}
    cur = parent;
    depth++;
  }

  return parts.join(' > ');
}

function getFullFilterRule(selector) {
  const clean = (selector || '').trim();
  if (!clean) return '';
  if (clean.includes('##') || clean.startsWith('||')) return clean;
  const host = window.location.hostname;
  if (scopeMode === 'domain' && host) {
    return `${host}##${clean}`;
  }
  return `##${clean}`;
}

function updateHighlightBox(targetEl) {
  if (!highlightBox || !highlightLabel) return;
  if (!targetEl || targetEl === document.documentElement || targetEl === document.body) {
    highlightBox.style.display = 'none';
    highlightLabel.style.display = 'none';
    return;
  }

  const rect = targetEl.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    highlightBox.style.display = 'none';
    highlightLabel.style.display = 'none';
    return;
  }

  highlightBox.style.display = 'block';
  highlightBox.style.left = `${rect.left}px`;
  highlightBox.style.top = `${rect.top}px`;
  highlightBox.style.width = `${rect.width}px`;
  highlightBox.style.height = `${rect.height}px`;

  const tag = targetEl.tagName.toLowerCase();
  const idStr = targetEl.id ? `#${targetEl.id}` : '';
  const clsStr = targetEl.classList && targetEl.classList.length > 0
    ? '.' + Array.from(targetEl.classList).slice(0, 2).join('.')
    : '';
  const dims = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;

  highlightLabel.textContent = `${tag}${idStr}${clsStr}  (${dims})`;
  highlightLabel.style.display = 'block';

  const labelTop = rect.top >= 28 ? rect.top - 26 : Math.min(window.innerHeight - 28, rect.bottom + 4);
  const labelLeft = Math.max(4, Math.min(window.innerWidth - 260, rect.left));
  highlightLabel.style.top = `${labelTop}px`;
  highlightLabel.style.left = `${labelLeft}px`;
}

function setPreviewState(active) {
  previewActive = active;
  if (!previewStyleEl) {
    previewStyleEl = document.createElement('style');
    previewStyleEl.id = 'browsy-picker-preview-style';
    (document.head || document.documentElement).appendChild(previewStyleEl);
  }

  if (previewActive && currentSelector) {
    try {
      document.querySelector(currentSelector);
      previewStyleEl.textContent = `${currentSelector} { display: none !important; }`;
      if (highlightBox) highlightBox.style.display = 'none';
      if (highlightLabel) highlightLabel.style.display = 'none';
    } catch (e) {
      previewStyleEl.textContent = '';
    }
  } else {
    previewStyleEl.textContent = '';
    if (selectedElement) updateHighlightBox(selectedElement);
  }
}

function zapElementTemporarily(el) {
  if (!el || el === document.body || el === document.documentElement || isBrowsyOverlayElement(el)) return false;
  zappedHistory.push({
    el,
    prevDisplay: el.style.getPropertyValue('display'),
    prevPriority: el.style.getPropertyPriority('display')
  });
  el.style.setProperty('display', 'none', 'important');
  hoveredElement = null;
  updateHighlightBox(null);
  updateZapperBarUI();
  return true;
}

function undoLastZap() {
  const last = zappedHistory.pop();
  if (last && last.el) {
    if (last.prevDisplay) {
      last.el.style.setProperty('display', last.prevDisplay, last.prevPriority || '');
    } else {
      last.el.style.removeProperty('display');
    }
    updateHighlightBox(last.el);
  }
  updateZapperBarUI();
}

function updateZapperBarUI() {
  if (!topZapperBar) return;
  const countEl = topZapperBar.querySelector('#browsy-zap-count');
  const undoBtn = topZapperBar.querySelector('#browsy-zap-undo');
  if (countEl) {
    countEl.textContent = `Skryto prvků: ${zappedHistory.length}`;
  }
  if (undoBtn) {
    undoBtn.disabled = zappedHistory.length === 0;
    undoBtn.style.opacity = zappedHistory.length === 0 ? '0.4' : '1';
    undoBtn.style.cursor = zappedHistory.length === 0 ? 'default' : 'pointer';
  }
}

function countMatchingElements(selector) {
  if (!selector || !selector.trim()) return 0;
  try {
    return document.querySelectorAll(selector.trim()).length;
  } catch (e) {
    return 0;
  }
}

function updatePickerDialogUI() {
  if (!pickerDialog) return;
  const selInput = pickerDialog.querySelector('#browsy-picker-selector-input');
  const rulePreview = pickerDialog.querySelector('#browsy-picker-rule-preview');
  const matchBadge = pickerDialog.querySelector('#browsy-picker-match-count');
  const parentBtn = pickerDialog.querySelector('#browsy-picker-parent-btn');
  const childBtn = pickerDialog.querySelector('#browsy-picker-child-btn');
  const scopeDomainBtn = pickerDialog.querySelector('#browsy-scope-domain');
  const scopeGlobalBtn = pickerDialog.querySelector('#browsy-scope-global');
  const previewBtn = pickerDialog.querySelector('#browsy-picker-preview-btn');

  if (selInput && document.activeElement !== selInput) {
    selInput.value = currentSelector;
  }
  if (rulePreview) {
    rulePreview.textContent = getFullFilterRule(currentSelector);
  }
  if (matchBadge) {
    const count = countMatchingElements(currentSelector);
    matchBadge.textContent = `Shodných prvků: ${count}`;
  }
  if (parentBtn) {
    const canUp = selectedElement && selectedElement.parentElement &&
                  selectedElement.parentElement !== document.body &&
                  selectedElement.parentElement !== document.documentElement;
    parentBtn.disabled = !canUp;
    parentBtn.style.opacity = canUp ? '1' : '0.4';
  }
  if (childBtn) {
    const canDown = childHistoryStack.length > 0;
    childBtn.disabled = !canDown;
    childBtn.style.opacity = canDown ? '1' : '0.4';
  }
  if (scopeDomainBtn && scopeGlobalBtn) {
    if (scopeMode === 'domain') {
      scopeDomainBtn.style.background = '#27272a';
      scopeDomainBtn.style.color = '#f4f4f5';
      scopeDomainBtn.style.borderColor = '#52525b';
      scopeGlobalBtn.style.background = 'transparent';
      scopeGlobalBtn.style.color = '#a1a1aa';
      scopeGlobalBtn.style.borderColor = '#27272a';
    } else {
      scopeGlobalBtn.style.background = '#27272a';
      scopeGlobalBtn.style.color = '#f4f4f5';
      scopeGlobalBtn.style.borderColor = '#52525b';
      scopeDomainBtn.style.background = 'transparent';
      scopeDomainBtn.style.color = '#a1a1aa';
      scopeDomainBtn.style.borderColor = '#27272a';
    }
  }
  if (previewBtn) {
    previewBtn.textContent = previewActive ? 'Zrušit náhled' : 'Náhled skrytí';
    previewBtn.style.background = previewActive ? '#f4f4f5' : '#18181b';
    previewBtn.style.color = previewActive ? '#09090b' : '#e4e4e7';
  }
}

function lockElementForPicker(el) {
  if (!el || el === document.body || el === document.documentElement || isBrowsyOverlayElement(el)) return;
  pickerLocked = true;
  selectedElement = el;
  childHistoryStack = [];
  setPreviewState(false);
  currentSelector = generateSmartSelector(el);
  updateHighlightBox(el);
  if (pickerDialog) {
    pickerDialog.style.display = 'flex';
  }
  updatePickerDialogUI();
}

function buildOverlayDOM() {
  if (overlayRoot) overlayRoot.remove();

  overlayRoot = document.createElement('div');
  overlayRoot.id = 'browsy-picker-root';
  overlayRoot.style.cssText = `
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 2147483646;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  `;

  highlightBox = document.createElement('div');
  highlightBox.style.cssText = `
    position: fixed;
    pointer-events: none;
    border: 2px solid #f4f4f5;
    background: rgba(244, 244, 245, 0.10);
    box-shadow: 0 0 0 1px rgba(9, 9, 11, 0.85), inset 0 0 0 1px rgba(9, 9, 11, 0.5);
    border-radius: 3px;
    transition: all 0.05s ease-out;
    display: none;
    z-index: 2147483646;
  `;

  highlightLabel = document.createElement('div');
  highlightLabel.style.cssText = `
    position: fixed;
    pointer-events: none;
    background: #09090b;
    color: #f4f4f5;
    border: 1px solid #3f3f46;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    white-space: nowrap;
    max-width: 340px;
    overflow: hidden;
    text-overflow: ellipsis;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6);
    display: none;
    z-index: 2147483647;
  `;

  // Top bar shown during hover/zapper mode
  topZapperBar = document.createElement('div');
  topZapperBar.style.cssText = `
    position: fixed;
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    pointer-events: auto;
    background: rgba(9, 9, 11, 0.96);
    color: #f4f4f5;
    border: 1px solid #27272a;
    border-radius: 10px;
    padding: 8px 14px;
    display: flex;
    align-items: center;
    gap: 12px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(12px);
    font-size: 12px;
    user-select: none;
  `;

  const modeTitle = pickerMode === 'temporary'
    ? 'Dočasné odstranění prvků (Zapper) — klikněte na prvek pro skrytí'
    : 'Výběr prvku k trvalému zablokování — klikněte na prvek na stránce';

  topZapperBar.innerHTML = `
    <div style="display:flex; align-items:center; gap:8px; font-weight:600; color:#f4f4f5;">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
      <span id="browsy-picker-mode-label">${modeTitle}</span>
    </div>
    <span id="browsy-zap-count" style="color:#a1a1aa; font-size:11px; padding-left:6px; border-left:1px solid #27272a;">Skryto prvků: ${zappedHistory.length}</span>
    <button id="browsy-zap-undo" style="
      background: #18181b;
      color: #e4e4e7;
      border: 1px solid #27272a;
      border-radius: 6px;
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
    ">Zpět</button>
    <button id="browsy-switch-mode-btn" style="
      background: #18181b;
      color: #e4e4e7;
      border: 1px solid #27272a;
      border-radius: 6px;
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
    ">${pickerMode === 'temporary' ? 'Režim trvalého filtru' : 'Režim Zapper'}</button>
    <button id="browsy-picker-exit-top" style="
      background: #27272a !important;
      color: #ffffff !important;
      border: 1px solid #52525b !important;
      border-radius: 6px;
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
    ">Hotovo (Esc)</button>
  `;

  // Bottom-right inspector dialog for permanent custom filter creation
  pickerDialog = document.createElement('div');
  pickerDialog.id = 'browsy-picker-panel';
  pickerDialog.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 390px;
    pointer-events: auto;
    background: #09090b;
    color: #f4f4f5;
    border: 1px solid #27272a;
    border-radius: 12px;
    padding: 16px;
    display: none;
    flex-direction: column;
    gap: 12px;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.75);
    z-index: 2147483647;
    user-select: none;
  `;

  pickerDialog.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid #18181b; padding-bottom:10px;">
      <div style="display:flex; align-items:center; gap:8px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f4f4f5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
        </svg>
        <span style="font-weight:600; font-size:13px; color:#f4f4f5;">Vlastní filtr prvku (Browsy Shields)</span>
      </div>
      <span id="browsy-picker-match-count" style="font-size:11px; color:#a1a1aa; background:#18181b; padding:2px 8px; border-radius:99px; border:1px solid #27272a;">Shodných prvků: 1</span>
    </div>

    <div style="display:flex; flex-direction:column; gap:6px;">
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <label style="font-size:11px; color:#a1a1aa; font-weight:500;">CSS Selektor prvku</label>
        <div style="display:flex; gap:4px;">
          <button id="browsy-picker-parent-btn" title="Vybrat nadřazený prvek" style="
            background:#18181b !important; color:#e4e4e7 !important; border:1px solid #27272a !important; border-radius:4px;
            padding:2px 8px; font-size:11px; cursor:pointer;
          ">&uarr; Nadřazený</button>
          <button id="browsy-picker-child-btn" title="Vrátit se na podřazený prvek" style="
            background:#18181b !important; color:#e4e4e7 !important; border:1px solid #27272a !important; border-radius:4px;
            padding:2px 8px; font-size:11px; cursor:pointer;
          ">&darr; Podřazený</button>
          <button id="browsy-picker-reselect-btn" title="Vybrat jiný prvek myší" style="
            background:#18181b !important; color:#e4e4e7 !important; border:1px solid #27272a !important; border-radius:4px;
            padding:2px 8px; font-size:11px; cursor:pointer;
          ">Vybrat jiný</button>
        </div>
      </div>
      <input id="browsy-picker-selector-input" type="text" spellcheck="false" style="
        width:100%; box-sizing:border-box; background:#121214 !important; color:#f4f4f5 !important;
        border:1px solid #27272a !important; border-radius:6px; padding:8px 10px;
        font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:12px;
        outline:none;
      " />
    </div>

    <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
      <div style="display:flex; gap:6px; flex:1;">
        <button id="browsy-scope-domain" style="
          flex:1; padding:6px 8px; border-radius:6px; border:1px solid #52525b;
          background:#27272a; color:#f4f4f5; font-size:11px; font-weight:500; cursor:pointer;
        ">Pouze tento web</button>
        <button id="browsy-scope-global" style="
          flex:1; padding:6px 8px; border-radius:6px; border:1px solid #27272a;
          background:transparent; color:#a1a1aa; font-size:11px; font-weight:500; cursor:pointer;
        ">Všechny weby</button>
      </div>
      <button id="browsy-picker-preview-btn" style="
        padding:6px 10px; border-radius:6px; border:1px solid #3f3f46;
        background:#18181b; color:#e4e4e7; font-size:11px; font-weight:500; cursor:pointer;
      ">Náhled skrytí</button>
    </div>

    <div style="background:#121214; border:1px solid #18181b; border-radius:6px; padding:6px 10px; font-size:11px; color:#a1a1aa; font-family:ui-monospace, monospace; word-break:break-all;">
      Pravidlo: <span id="browsy-picker-rule-preview" style="color:#ffffff;"></span>
    </div>

    <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding-top:4px;">
      <button id="browsy-picker-cancel-btn" style="
        padding:8px 12px; border-radius:6px; border:1px solid #27272a !important;
        background:#121214 !important; color:#a1a1aa !important; font-size:12px; font-weight:500; cursor:pointer;
      ">Zrušit</button>
      <div style="display:flex; gap:8px;">
        <button id="browsy-picker-temp-btn" style="
          padding:8px 12px; border-radius:6px; border:1px solid #3f3f46 !important;
          background:#18181b !important; color:#f4f4f5 !important; font-size:12px; font-weight:500; cursor:pointer;
        ">Odstranit dočasně</button>
        <button id="browsy-picker-save-btn" style="
          padding:8px 14px; border-radius:6px; border:1px solid #71717a !important;
          background:#27272a !important; color:#ffffff !important; font-size:12px; font-weight:600; cursor:pointer;
        ">Zablokovat trvale</button>
      </div>
    </div>
  `;

  overlayRoot.appendChild(highlightBox);
  overlayRoot.appendChild(highlightLabel);
  overlayRoot.appendChild(topZapperBar);
  overlayRoot.appendChild(pickerDialog);
  (document.body || document.documentElement).appendChild(overlayRoot);

  // Wire Top Bar Events
  topZapperBar.querySelector('#browsy-zap-undo').onclick = (e) => {
    e.stopPropagation();
    undoLastZap();
  };
  topZapperBar.querySelector('#browsy-switch-mode-btn').onclick = (e) => {
    e.stopPropagation();
    pickerMode = pickerMode === 'temporary' ? 'permanent' : 'temporary';
    pickerLocked = false;
    setPreviewState(false);
    if (pickerDialog) pickerDialog.style.display = 'none';
    const label = topZapperBar.querySelector('#browsy-picker-mode-label');
    const switchBtn = topZapperBar.querySelector('#browsy-switch-mode-btn');
    if (label) {
      label.textContent = pickerMode === 'temporary'
        ? 'Dočasné odstranění prvků (Zapper) — klikněte na prvek pro skrytí'
        : 'Výběr prvku k trvalému zablokování — klikněte na prvek na stránce';
    }
    if (switchBtn) {
      switchBtn.textContent = pickerMode === 'temporary' ? 'Režim trvalého filtru' : 'Režim Zapper';
    }
  };
  topZapperBar.querySelector('#browsy-picker-exit-top').onclick = (e) => {
    e.stopPropagation();
    stopElementPicker();
  };

  // Wire Picker Dialog Events
  const selInput = pickerDialog.querySelector('#browsy-picker-selector-input');
  selInput.addEventListener('input', () => {
    currentSelector = selInput.value.trim();
    if (previewActive) setPreviewState(true);
    updatePickerDialogUI();
  });

  pickerDialog.querySelector('#browsy-picker-parent-btn').onclick = (e) => {
    e.stopPropagation();
    if (selectedElement && selectedElement.parentElement &&
        selectedElement.parentElement !== document.body &&
        selectedElement.parentElement !== document.documentElement) {
      childHistoryStack.push(selectedElement);
      selectedElement = selectedElement.parentElement;
      currentSelector = generateSmartSelector(selectedElement);
      if (previewActive) setPreviewState(true);
      else updateHighlightBox(selectedElement);
      updatePickerDialogUI();
    }
  };

  pickerDialog.querySelector('#browsy-picker-child-btn').onclick = (e) => {
    e.stopPropagation();
    if (childHistoryStack.length > 0) {
      selectedElement = childHistoryStack.pop();
      currentSelector = generateSmartSelector(selectedElement);
      if (previewActive) setPreviewState(true);
      else updateHighlightBox(selectedElement);
      updatePickerDialogUI();
    }
  };

  pickerDialog.querySelector('#browsy-picker-reselect-btn').onclick = (e) => {
    e.stopPropagation();
    pickerLocked = false;
    setPreviewState(false);
    pickerDialog.style.display = 'none';
  };

  pickerDialog.querySelector('#browsy-scope-domain').onclick = (e) => {
    e.stopPropagation();
    scopeMode = 'domain';
    updatePickerDialogUI();
  };

  pickerDialog.querySelector('#browsy-scope-global').onclick = (e) => {
    e.stopPropagation();
    scopeMode = 'global';
    updatePickerDialogUI();
  };

  pickerDialog.querySelector('#browsy-picker-preview-btn').onclick = (e) => {
    e.stopPropagation();
    setPreviewState(!previewActive);
    updatePickerDialogUI();
  };

  pickerDialog.querySelector('#browsy-picker-cancel-btn').onclick = (e) => {
    e.stopPropagation();
    stopElementPicker();
  };

  pickerDialog.querySelector('#browsy-picker-temp-btn').onclick = (e) => {
    e.stopPropagation();
    setPreviewState(false);
    if (currentSelector) {
      try {
        const matches = document.querySelectorAll(currentSelector);
        matches.forEach(m => zapElementTemporarily(m));
      } catch (err) {
        if (selectedElement) zapElementTemporarily(selectedElement);
      }
    } else if (selectedElement) {
      zapElementTemporarily(selectedElement);
    }
    stopElementPicker();
  };

  pickerDialog.querySelector('#browsy-picker-save-btn').onclick = async (e) => {
    e.stopPropagation();
    const rule = getFullFilterRule(currentSelector);
    if (!rule) return;
    setPreviewState(false);
    await ipcRenderer.invoke('shields:add-custom-filter', rule);
    stopElementPicker();
  };

  updateZapperBarUI();
}

function onPickerMouseMove(e) {
  if (!pickerActive || pickerLocked) return;
  const el = document.elementFromPoint(e.clientX, e.clientY);
  if (!el || isBrowsyOverlayElement(el)) return;
  if (el !== hoveredElement) {
    hoveredElement = el;
    updateHighlightBox(hoveredElement);
  }
}

function onPickerClick(e) {
  if (!pickerActive) return;
  if (isBrowsyOverlayElement(e.target)) return;

  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

  if (pickerLocked) return;

  const target = hoveredElement || document.elementFromPoint(e.clientX, e.clientY);
  if (!target || isBrowsyOverlayElement(target)) return;

  if (pickerMode === 'temporary') {
    zapElementTemporarily(target);
  } else {
    lockElementForPicker(target);
  }
}

function onPickerKeyDown(e) {
  if (!pickerActive) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    stopElementPicker();
  } else if (e.key === 'z' && (e.ctrlKey || e.metaKey) && pickerMode === 'temporary') {
    e.preventDefault();
    e.stopPropagation();
    undoLastZap();
  }
}

// Pages commonly react to mousedown/pointerdown (navigation, menus, drag handlers),
// so every pointer phase is swallowed - not only "click".
const PICKER_SWALLOWED_EVENTS = ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick', 'auxclick'];

function onPickerSwallow(e) {
  if (!pickerActive || isBrowsyOverlayElement(e.target)) return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
}

// Keep the highlight box aligned with its element when the page scrolls or resizes
function onPickerViewportChange() {
  if (!pickerActive) return;
  if (pickerLocked) {
    if (selectedElement && !previewActive) updateHighlightBox(selectedElement);
  } else if (hoveredElement) {
    updateHighlightBox(hoveredElement);
  }
}

function startElementPicker(options = {}) {
  if (window.location.protocol === 'file:' || window.location.protocol === 'browsy:') return;

  pickerMode = options.mode === 'temporary' ? 'temporary' : 'permanent';
  pickerActive = true;
  pickerLocked = false;
  hoveredElement = null;
  selectedElement = null;
  childHistoryStack = [];
  setPreviewState(false);

  buildOverlayDOM();

  window.addEventListener('mousemove', onPickerMouseMove, true);
  window.addEventListener('click', onPickerClick, true);
  window.addEventListener('keydown', onPickerKeyDown, true);
  window.addEventListener('scroll', onPickerViewportChange, true);
  window.addEventListener('resize', onPickerViewportChange);
  PICKER_SWALLOWED_EVENTS.forEach(type => window.addEventListener(type, onPickerSwallow, true));

  // If invoked from right-click context menu with specific (x, y) coordinates:
  if (typeof options.x === 'number' && typeof options.y === 'number') {
    const initialEl = document.elementFromPoint(options.x, options.y);
    if (initialEl && !isBrowsyOverlayElement(initialEl) && initialEl !== document.body && initialEl !== document.documentElement) {
      if (pickerMode === 'temporary') {
        zapElementTemporarily(initialEl);
      } else {
        lockElementForPicker(initialEl);
      }
    }
  }
}

function stopElementPicker() {
  pickerActive = false;
  pickerLocked = false;
  hoveredElement = null;
  selectedElement = null;
  setPreviewState(false);

  window.removeEventListener('mousemove', onPickerMouseMove, true);
  window.removeEventListener('click', onPickerClick, true);
  window.removeEventListener('keydown', onPickerKeyDown, true);
  window.removeEventListener('scroll', onPickerViewportChange, true);
  window.removeEventListener('resize', onPickerViewportChange);
  PICKER_SWALLOWED_EVENTS.forEach(type => window.removeEventListener(type, onPickerSwallow, true));

  if (overlayRoot) {
    overlayRoot.remove();
    overlayRoot = null;
  }
}

ipcRenderer.on('browsy:start-element-picker', (event, options) => {
  startElementPicker(options || {});
});

