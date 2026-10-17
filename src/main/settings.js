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
        { id: 'ws_default', name: 'Osobní', icon: '👤', color: '#6366f1' },
        { id: 'ws_work', name: 'Práce', icon: '💼', color: '#10b981' },
        { id: 'ws_dev', name: 'Vývoj', icon: '⚡', color: '#f59e0b' }
      ],
      activeWorkspaceId: 'ws_default'
    };
    this.settings = this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const raw = fs.readFileSync(this.settingsPath, 'utf8');
        return { ...this.defaults, ...JSON.parse(raw) };
      }
    } catch (err) {
      console.error('[Settings] Failed to load settings:', err);
    }
    return { ...this.defaults };
  }

  save() {
    try {
      fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf8');
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
