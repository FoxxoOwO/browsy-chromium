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
