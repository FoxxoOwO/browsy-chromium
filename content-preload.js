const { ipcRenderer, contextBridge } = require('electron');

if (window.location.protocol === 'file:' && window.location.pathname.includes('extensions.html')) {
  contextBridge.exposeInMainWorld('browsyExtAPI', {
    getAll: () => ipcRenderer.invoke('extensions:get-all'),
    install: () => ipcRenderer.invoke('extensions:pick-install'),
    toggle: (id, enabled) => ipcRenderer.invoke('extensions:toggle', id, enabled),
    remove: (id) => ipcRenderer.invoke('extensions:remove', id)
  });
}

/**
 * Browsy Chromium Content Preload
 * Injected into web pages to handle Text Expansion, Video Detection, and Popup Guard.
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

// Request initial snippets
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

  // Reset on Escape, Enter, Tab or navigation keys
  if (['Escape', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    keyBuffer = '';
    return;
  }

  if (e.key === 'Backspace') {
    keyBuffer = keyBuffer.slice(0, -1);
    return;
  }

  // Only accumulate single characters
  if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    keyBuffer += e.key;
    if (keyBuffer.length > BUFFER_MAX) {
      keyBuffer = keyBuffer.slice(-BUFFER_MAX);
    }

    // Check for snippet match
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
      // Check if text preceding cursor matches trigger
      const currentVal = target.value;
      const typedTrigger = currentVal.substring(start - triggerLen, start);
      if (typedTrigger === snippet.trigger) {
        // Select trigger and replace
        target.setSelectionRange(start - triggerLen, start);
        document.execCommand('insertText', false, replacement);
        // Fallback for modern inputs if execCommand fails
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
      // Delete backward triggerLen chars and insert replacement
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

// Observe DOM for dynamically loaded video players
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
    injectStoreFloatingBar('chrome', extId, 'Chrome Web Store');
    return;
  }

  // 2. Opera Add-ons
  const operaMatch = href.match(/addons\.opera\.com\/(?:[a-zA-Z-]+\/)?extensions\/details\/([a-zA-Z0-9_-]+)/i);
  if (operaMatch) {
    const slug = operaMatch[1];
    injectStoreFloatingBar('opera', slug, 'Opera Add-ons');

    // Intercept "Add to Opera" clicks
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href*="/extensions/download/"]');
      if (link) {
        e.preventDefault();
        e.stopPropagation();
        installExtension('opera', slug, document.title);
      }
    }, true);
    return;
  }

  // 3. Firefox Add-ons (AMO)
  const firefoxMatch = href.match(/addons\.mozilla\.org\/(?:[a-zA-Z-]+\/)?firefox\/addon\/([a-zA-Z0-9_-]+)/i);
  if (firefoxMatch) {
    const slug = firefoxMatch[1];
    injectStoreFloatingBar('firefox', slug, 'Firefox Add-ons');
    enhanceAmoPage(slug);
    return;
  }
}

function enhanceAmoPage(slug) {
  const tryEnhance = () => {
    const getFirefoxWrap = document.querySelector('.Addon-get-firefox, .AMOBanner--get-firefox, .InstallButtonWrapper');
    if (getFirefoxWrap && !document.getElementById('browsy-amo-btn')) {
      const btn = document.createElement('button');
      btn.id = 'browsy-amo-btn';
      btn.textContent = '+ Přidat do Browsy Chromium';
      btn.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: #09090b;
        color: #f4f4f5;
        border: 1px solid #3f3f46;
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        margin: 12px 0;
        box-shadow: 0 4px 16px rgba(0,0,0,0.5);
        transition: all 0.2s ease;
      `;
      btn.onmouseenter = () => { btn.style.background = '#18181b'; btn.style.borderColor = '#71717a'; };
      btn.onmouseleave = () => { btn.style.background = '#09090b'; btn.style.borderColor = '#3f3f46'; };
      btn.onclick = () => installExtension('firefox', slug, document.title);

      getFirefoxWrap.parentNode.insertBefore(btn, getFirefoxWrap);
    }
  };

  tryEnhance();
  const obs = new MutationObserver(tryEnhance);
  obs.observe(document.body || document.documentElement, { childList: true, subtree: true });
}

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

async function installExtension(store, id, title) {
  const btn = document.getElementById('browsy-btn-store-install');
  if (btn) {
    btn.textContent = 'Instaluji...';
    btn.disabled = true;
  }
  const amoBtn = document.getElementById('browsy-amo-btn');
  if (amoBtn) {
    amoBtn.textContent = 'Stahuji a instaluji...';
    amoBtn.disabled = true;
  }

  try {
    const res = await ipcRenderer.invoke('extensions:install-from-store', store, id, title);
    if (res.success) {
      if (btn) btn.textContent = '✔ Nainstalováno!';
      if (amoBtn) amoBtn.textContent = '✔ Úspěšně nainstalováno!';
      setTimeout(() => {
        const banner = document.getElementById('browsy-store-banner');
        if (banner) banner.remove();
      }, 2500);
    } else {
      alert('Chyba při instalaci doplňku: ' + (res.error || 'Neznámá chyba'));
      if (btn) { btn.textContent = 'Přidat do Browsy'; btn.disabled = false; }
      if (amoBtn) { amoBtn.textContent = '+ Přidat do Browsy Chromium'; amoBtn.disabled = false; }
    }
  } catch (e) {
    alert('Chyba: ' + e.message);
    if (btn) { btn.textContent = 'Přidat do Browsy'; btn.disabled = false; }
    if (amoBtn) { amoBtn.textContent = '+ Přidat do Browsy Chromium'; amoBtn.disabled = false; }
  }
}

window.addEventListener('DOMContentLoaded', setupStoreIntegration);
