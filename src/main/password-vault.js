const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

class PasswordVault {
  constructor() {
    this.userDataPath = (app && typeof app.getPath === 'function') 
      ? app.getPath('userData') 
      : path.join(process.cwd(), '.browsy-data');
    this.vaultPath = path.join(this.userDataPath, 'browsy-vault.json');
    this.salt = 'browsy-local-vault-salt-v1';
    this.key = crypto.scryptSync(process.env.COMPUTERNAME || 'browsy-device-master', this.salt, 32);
    this.entries = this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.vaultPath)) {
        const raw = fs.readFileSync(this.vaultPath, 'utf8');
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error('[PasswordVault] Failed to load vault:', e);
    }
    return [];
  }

  save() {
    try {
      fs.mkdirSync(this.userDataPath, { recursive: true });
      fs.writeFileSync(this.vaultPath, JSON.stringify(this.entries, null, 2), 'utf8');
    } catch (e) {
      console.error('[PasswordVault] Failed to save vault:', e);
    }
  }

  encrypt(text) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');
    return {
      cipherText: encrypted,
      iv: iv.toString('hex'),
      tag: tag
    };
  }

  decrypt(cipherText, ivHex, tagHex) {
    try {
      const iv = Buffer.from(ivHex, 'hex');
      const tag = Buffer.from(tagHex, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAuthTag(tag);
      let decrypted = decipher.update(cipherText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (e) {
      return '';
    }
  }

  addLogin({ url, username, password, label = '' }) {
    if (!url || !username || !password) {
      throw new Error('URL, uživatelské jméno a heslo jsou povinné');
    }
    const encrypted = this.encrypt(password);
    const entry = {
      id: 'entry_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      url: url.trim(),
      username: username.trim(),
      label: label.trim() || url.trim(),
      cipherText: encrypted.cipherText,
      iv: encrypted.iv,
      tag: encrypted.tag,
      createdAt: new Date().toISOString()
    };
    this.entries.push(entry);
    this.save();
    return {
      id: entry.id,
      url: entry.url,
      username: entry.username,
      label: entry.label,
      createdAt: entry.createdAt
    };
  }

  getLogins(filterDomain = null) {
    return this.entries
      .filter(item => {
        if (!filterDomain) return true;
        return item.url.toLowerCase().includes(filterDomain.toLowerCase());
      })
      .map(item => ({
        id: item.id,
        url: item.url,
        username: item.username,
        label: item.label,
        password: this.decrypt(item.cipherText, item.iv, item.tag),
        createdAt: item.createdAt
      }));
  }

  deleteLogin(id) {
    const idx = this.entries.findIndex(e => e.id === id);
    if (idx !== -1) {
      this.entries.splice(idx, 1);
      this.save();
      return true;
    }
    return false;
  }

  clearVault() {
    this.entries = [];
    this.save();
    return true;
  }
}

module.exports = new PasswordVault();
