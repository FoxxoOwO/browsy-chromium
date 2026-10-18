const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class SettingsManager {
  constructor() {
    this.userDataPath = (app && typeof app.getPath === 'function') 
      ? app.getPath('userData') 
      : path.join(process.cwd(), '.browsy-data');
    this.settingsPath = path.join(this.userDataPath, 'browsy-settings.json');
    this.defaults = {
      tabLayout: 'horizontal', // 'horizontal' | 'vertical'
      verticalTabsCollapsed: false,
      theme: 'dark',
      shieldsEnabled: true,
      popupBlockerEnabled: true,
      videoDownloaderEnabled: true,
      textExpanderEnabled: true,
      defaultSearchEngine: 'google',
      homePage: 'browsy://newtab',
      shieldsWhitelist: [],
      customFilters: [],
      popupWhitelist: [],
      textExpanderSnippets: [
        { id: '1', trigger: ':date', replacement: '{date}', label: 'Dnešní datum' },
        { id: '2', trigger: ':time', replacement: '{time}', label: 'Aktuální čas' },
        { id: '3', trigger: ':mail', replacement: 'muj.email@example.com', label: 'E-mailová adresa' },
        { id: '4', trigger: ':shrug', replacement: '¯\\_(ツ)_/¯', label: 'Shrug smajlík' },
        { id: '5', trigger: ':lenny', replacement: '( ͡° ͜ʖ ͡°)', label: 'Lenny smajlík' },
        { id: '6', trigger: ':lorem', replacement: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.', label: 'Lorem Ipsum text' },
        { id: '7', trigger: ':greet', replacement: 'Dobrý den,\n\nděkuji za Vaši zprávu.\n\nS pozdravem,\n', label: 'Formální pozdrav' },
        { id: '8', trigger: ':thx', replacement: 'Děkuji mnohokrát!', label: 'Poděkování' }
      ],
      workspaces: [
        { id: 'ws_default', name: 'Osobní', icon: 'personal', color: '#f4f4f5' },
        { id: 'ws_work', name: 'Práce', icon: 'work', color: '#d4d4d8' },
        { id: 'ws_dev', name: 'Vývoj', icon: 'dev', color: '#a1a1aa' }
      ],
      activeWorkspaceId: 'ws_default'
    };
    this.saveTimer = null;
    this.dirty = false;
    this.settings = this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const raw = fs.readFileSync(this.settingsPath, 'utf8');
        try {
          return { ...structuredClone(this.defaults), ...JSON.parse(raw) };
        } catch (parseErr) {
          // Keep the broken file for manual recovery instead of silently overwriting it
          console.error('[Settings] Corrupted settings file, backing it up:', parseErr);
          try { fs.renameSync(this.settingsPath, this.settingsPath + '.corrupt'); } catch (e) {}
        }
      }
    } catch (err) {
      console.error('[Settings] Failed to load settings:', err);
    }
    return structuredClone(this.defaults);
  }

  /**
   * Schedules a (debounced) write. Many consecutive set() calls produce a single disk write.
   */
  save() {
    this.dirty = true;
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => this.flush(), 200);
  }

  /**
   * Writes pending changes immediately and atomically (tmp file + rename).
   */
  flush() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (!this.dirty) return;
    this.dirty = false;
    try {
      fs.mkdirSync(this.userDataPath, { recursive: true });
      const tmpPath = this.settingsPath + '.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify(this.settings, null, 2), 'utf8');
      fs.renameSync(tmpPath, this.settingsPath);
    } catch (err) {
      console.error('[Settings] Failed to save settings:', err);
    }
  }

  get(key, defaultValue = null) {
    if (key in this.settings) {
      return this.settings[key];
    }
    return defaultValue !== null ? defaultValue : this.defaults[key];
  }

  set(key, value) {
    this.settings[key] = value;
    this.save();
    return this.settings;
  }

  update(partial) {
    this.settings = { ...this.settings, ...partial };
    this.save();
    return this.settings;
  }

  getAll() {
    return { ...this.settings };
  }
}

module.exports = new SettingsManager();
