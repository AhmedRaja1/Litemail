/**
 * LiteMail Storage Engine
 * Handles offline local storage, message CRUD, drafts, statistics, and sneakernet export/import.
 */

const StorageKeys = {
  MESSAGES: 'litemail_messages_v1',
  SETTINGS: 'litemail_settings_v1',
  PROFILE: 'litemail_profile_v1',
  DRAFT: 'litemail_draft_v1',
  STATS: 'litemail_stats_v1'
};

const DefaultSettings = {
  theme: 'dark', // 'dark', 'light', 'solar'
  fontSize: 'medium', // 'small', 'medium', 'large'
  providerMode: 'simulation', // 'simulation', 'gmail', 'outlook', 'relay'
  gatewayMode: 'simulation', // backwards compatibility
  gatewayUrl: '',
  gatewayApiKey: '',
  gmailClientId: '',
  gmailAccessToken: '',
  outlookClientId: '',
  outlookAccessToken: '',
  autoSync: true,
  autoSyncIntervalSec: 60,
  compressSimulation: true,
  offlineMode: false // user can force offline simulation
};

const DefaultProfile = {
  name: 'Field Operator',
  email: 'operator@remotestation.org',
  stationId: 'ECHO-4'
};

class MailStorage {
  constructor() {
    this.init();
  }

  init() {
    if (!localStorage.getItem(StorageKeys.MESSAGES)) {
      this.resetToDemo();
    }
    if (!localStorage.getItem(StorageKeys.SETTINGS)) {
      this.saveSettings(DefaultSettings);
    }
    if (!localStorage.getItem(StorageKeys.PROFILE)) {
      this.saveProfile(DefaultProfile);
    }
    if (!localStorage.getItem(StorageKeys.STATS)) {
      this.saveStats({
        totalSentBytes: 743,
        totalReceivedBytes: 1424,
        sessionSentBytes: 0,
        sessionReceivedBytes: 0,
        syncCount: 3,
        lastSyncTime: new Date().toISOString()
      });
    }
  }

  // --- Messages CRUD ---

  getAllMessages() {
    try {
      const data = localStorage.getItem(StorageKeys.MESSAGES);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Failed to parse messages from storage', e);
      return [];
    }
  }

  saveAllMessages(messages) {
    try {
      localStorage.setItem(StorageKeys.MESSAGES, JSON.stringify(messages));
    } catch (e) {
      console.error('Storage quota exceeded or error saving messages', e);
    }
  }

  getFolderMessages(folder = 'inbox', searchQuery = '', filter = 'all') {
    let list = this.getAllMessages();

    if (folder === 'starred') {
      list = list.filter(m => m.starred && m.folder !== 'trash');
    } else {
      list = list.filter(m => m.folder === folder);
    }

    if (filter === 'unread') {
      list = list.filter(m => m.unread);
    } else if (filter === 'starred') {
      list = list.filter(m => m.starred);
    }

    if (searchQuery && searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(m => 
        (m.subject && m.subject.toLowerCase().includes(q)) ||
        (m.from && m.from.toLowerCase().includes(q)) ||
        (m.to && m.to.toLowerCase().includes(q)) ||
        (m.cc && m.cc.toLowerCase().includes(q)) ||
        (m.body && m.body.toLowerCase().includes(q))
      );
    }

    // Sort newest first
    return list.sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  getMessage(id) {
    const list = this.getAllMessages();
    return list.find(m => m.id === id) || null;
  }

  addMessage(msg) {
    const list = this.getAllMessages();
    if (!msg.sizeBytes) {
      msg.sizeBytes = this.calculateByteSize(msg);
    }
    // Prevent duplicates
    const existingIdx = list.findIndex(m => m.id === msg.id);
    if (existingIdx !== -1) {
      list[existingIdx] = { ...list[existingIdx], ...msg };
    } else {
      list.unshift(msg);
    }
    this.saveAllMessages(list);
    return msg;
  }

  mergeIncomingMessages(newMessages = []) {
    const list = this.getAllMessages();
    let addedCount = 0;

    newMessages.forEach(msg => {
      const exists = list.some(m => m.id === msg.id);
      if (!exists) {
        list.unshift(msg);
        addedCount++;
      }
    });

    if (addedCount > 0) {
      this.saveAllMessages(list);
    }
    return addedCount;
  }

  updateMessage(id, updates) {
    const list = this.getAllMessages();
    const index = list.findIndex(m => m.id === id);
    if (index !== -1) {
      list[index] = { ...list[index], ...updates };
      this.saveAllMessages(list);
      return list[index];
    }
    return null;
  }

  deleteMessage(id) {
    const list = this.getAllMessages();
    const msg = list.find(m => m.id === id);
    if (!msg) return;

    if (msg.folder === 'trash') {
      // Permanent delete
      const filtered = list.filter(m => m.id !== id);
      this.saveAllMessages(filtered);
    } else {
      // Move to trash
      msg.originalFolder = msg.folder;
      msg.folder = 'trash';
      this.saveAllMessages(list);
    }
  }

  restoreMessage(id) {
    const list = this.getAllMessages();
    const msg = list.find(m => m.id === id);
    if (msg && msg.folder === 'trash') {
      msg.folder = msg.originalFolder || 'inbox';
      delete msg.originalFolder;
      this.saveAllMessages(list);
    }
  }

  toggleStar(id) {
    const msg = this.getMessage(id);
    if (msg) {
      return this.updateMessage(id, { starred: !msg.starred });
    }
    return null;
  }

  markRead(id, unread = false) {
    return this.updateMessage(id, { unread });
  }

  markAllRead(folder = 'inbox') {
    const list = this.getAllMessages();
    list.forEach(m => {
      if (m.folder === folder) {
        m.unread = false;
      }
    });
    this.saveAllMessages(list);
  }

  emptyTrash() {
    const list = this.getAllMessages().filter(m => m.folder !== 'trash');
    this.saveAllMessages(list);
  }

  getFolderCounts() {
    const list = this.getAllMessages();
    return {
      inboxUnread: list.filter(m => m.folder === 'inbox' && m.unread).length,
      inboxTotal: list.filter(m => m.folder === 'inbox').length,
      outboxCount: list.filter(m => m.folder === 'outbox').length,
      sentCount: list.filter(m => m.folder === 'sent').length,
      draftsCount: list.filter(m => m.folder === 'drafts').length,
      trashCount: list.filter(m => m.folder === 'trash').length,
      starredCount: list.filter(m => m.starred && m.folder !== 'trash').length
    };
  }

  // --- Draft Management ---

  saveDraft(draft) {
    try {
      draft.lastSaved = new Date().toISOString();
      localStorage.setItem(StorageKeys.DRAFT, JSON.stringify(draft));
    } catch (e) {
      console.error('Error saving draft', e);
    }
  }

  loadDraft() {
    try {
      const data = localStorage.getItem(StorageKeys.DRAFT);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  }

  clearDraft() {
    localStorage.removeItem(StorageKeys.DRAFT);
  }

  // --- Settings & Profile ---

  getSettings() {
    try {
      const data = localStorage.getItem(StorageKeys.SETTINGS);
      return data ? { ...DefaultSettings, ...JSON.parse(data) } : { ...DefaultSettings };
    } catch (e) {
      return { ...DefaultSettings };
    }
  }

  saveSettings(settings) {
    const current = this.getSettings();
    const merged = { ...current, ...settings };
    localStorage.setItem(StorageKeys.SETTINGS, JSON.stringify(merged));
  }

  getProfile() {
    try {
      const data = localStorage.getItem(StorageKeys.PROFILE);
      return data ? { ...DefaultProfile, ...JSON.parse(data) } : { ...DefaultProfile };
    } catch (e) {
      return { ...DefaultProfile };
    }
  }

  saveProfile(profile) {
    const current = this.getProfile();
    const merged = { ...current, ...profile };
    localStorage.setItem(StorageKeys.PROFILE, JSON.stringify(merged));
  }

  // --- Telemetry & Stats ---

  getStats() {
    try {
      const data = localStorage.getItem(StorageKeys.STATS);
      return data ? JSON.parse(data) : {
        totalSentBytes: 0,
        totalReceivedBytes: 0,
        sessionSentBytes: 0,
        sessionReceivedBytes: 0,
        syncCount: 0,
        lastSyncTime: null
      };
    } catch (e) {
      return { totalSentBytes: 0, totalReceivedBytes: 0, sessionSentBytes: 0, sessionReceivedBytes: 0 };
    }
  }

  saveStats(stats) {
    localStorage.setItem(StorageKeys.STATS, JSON.stringify(stats));
  }

  recordTraffic(sentBytes = 0, receivedBytes = 0) {
    const stats = this.getStats();
    stats.totalSentBytes += sentBytes;
    stats.totalReceivedBytes += receivedBytes;
    stats.sessionSentBytes += sentBytes;
    stats.sessionReceivedBytes += receivedBytes;
    stats.lastSyncTime = new Date().toISOString();
    stats.syncCount = (stats.syncCount || 0) + 1;
    this.saveStats(stats);
    return stats;
  }

  // --- Utility & Sneakernet Helpers ---

  calculateByteSize(msg) {
    const payload = `${msg.to || ''}${msg.cc || ''}${msg.bcc || ''}${msg.subject || ''}${msg.body || ''}`;
    return new Blob([payload]).size;
  }

  resetToDemo() {
    if (typeof DEMO_MESSAGES !== 'undefined') {
      this.saveAllMessages(JSON.parse(JSON.stringify(DEMO_MESSAGES)));
    } else {
      this.saveAllMessages([]);
    }
  }

  exportBackupJSON() {
    const backup = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      profile: this.getProfile(),
      settings: this.getSettings(),
      stats: this.getStats(),
      messages: this.getAllMessages()
    };
    return JSON.stringify(backup, null, 2);
  }

  importBackupJSON(jsonStr) {
    try {
      const data = JSON.parse(jsonStr);
      if (data && Array.isArray(data.messages)) {
        this.saveAllMessages(data.messages);
        if (data.profile) this.saveProfile(data.profile);
        if (data.settings) this.saveSettings(data.settings);
        return true;
      }
      return false;
    } catch (e) {
      console.error('Invalid import data', e);
      return false;
    }
  }

  exportMessageAsEml(id) {
    const msg = this.getMessage(id);
    if (!msg) return null;

    const emlContent = [
      `Date: ${new Date(msg.date).toUTCString()}`,
      `From: ${msg.from || 'anonymous@remotestation.org'}`,
      `To: ${msg.to || ''}`,
      msg.cc ? `Cc: ${msg.cc}` : null,
      msg.bcc ? `Bcc: ${msg.bcc}` : null,
      `Subject: ${msg.subject || '(No Subject)'}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset=utf-8`,
      `Content-Transfer-Encoding: 8bit`,
      `X-LiteMail-ID: ${msg.id}`,
      ``,
      msg.body || ''
    ].filter(line => line !== null).join('\r\n');

    return emlContent;
  }

  exportMessageAsTxt(id) {
    const msg = this.getMessage(id);
    if (!msg) return null;

    const txtContent = [
      `=============================================================`,
      `LITEMAIL PLAIN-TEXT ARCHIVE`,
      `=============================================================`,
      `Date:    ${new Date(msg.date).toLocaleString()}`,
      `From:    ${msg.from}`,
      `To:      ${msg.to}`,
      msg.cc ? `Cc:      ${msg.cc}` : null,
      `Subject: ${msg.subject}`,
      `Size:    ${msg.sizeBytes} Bytes`,
      `=============================================================`,
      ``,
      msg.body,
      ``,
      `=============================================================`
    ].filter(line => line !== null).join('\n');

    return txtContent;
  }
}

// Global instance
window.mailStorage = new MailStorage();
