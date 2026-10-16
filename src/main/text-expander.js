const path = require('path');
const { clipboard } = require('electron');
const settingsManager = require('./settings');

let nativeCore = null;
try {
  nativeCore = require(path.join(__dirname, '../../browsy-core.node'));
} catch (e) {}

class TextExpander {
  constructor() {
    this.snippets = settingsManager.get('textExpanderSnippets', []);
  }

  getSnippets() {
    return settingsManager.get('textExpanderSnippets', []);
  }

  isEnabled() {
    return settingsManager.get('textExpanderEnabled', true);
  }

  setEnabled(enabled) {
    settingsManager.set('textExpanderEnabled', enabled);
    return enabled;
  }

  addSnippet(trigger, replacement, label = '') {
    const list = this.getSnippets();
    const newSnippet = {
      id: 'snippet_' + Date.now(),
      trigger: trigger.trim(),
      replacement: replacement,
      label: label.trim() || trigger.trim()
    };
    list.push(newSnippet);
    settingsManager.set('textExpanderSnippets', list);
    return newSnippet;
  }

  updateSnippet(id, trigger, replacement, label) {
    const list = this.getSnippets();
    const idx = list.findIndex(s => s.id === id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], trigger: trigger.trim(), replacement, label: label.trim() };
      settingsManager.set('textExpanderSnippets', list);
      return list[idx];
    }
    throw new Error('Zkratka nebyla nalezena');
  }

  deleteSnippet(id) {
    let list = this.getSnippets();
    list = list.filter(s => s.id !== id);
    settingsManager.set('textExpanderSnippets', list);
    return true;
  }

  resolveDynamicVariables(text) {
    const now = new Date();
    const dateStr = now.toLocaleDateString('cs-CZ');
    const timeStr = now.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
    const yearStr = now.getFullYear().toString();
    let clipText = '';
    try {
      clipText = clipboard.readText() || '';
    } catch (e) {
      // clipboard access error fallback
    }

    if (nativeCore && nativeCore.nativeExpandText) {
      return nativeCore.nativeExpandText(text, dateStr, timeStr, yearStr, clipText);
    }

    return text
      .replace(/{date}/gi, dateStr)
      .replace(/{time}/gi, timeStr)
      .replace(/{year}/gi, yearStr)
      .replace(/{clipboard}/gi, clipText);
  }
}

module.exports = new TextExpander();
