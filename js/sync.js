/**
 * LiteMail Sync & Low-Bandwidth Network Engine
 * Handles offline detection, Outbox queueing, real API dispatch, and bandwidth metrics.
 */

class SyncEngine {
  constructor(storage) {
    this.storage = storage;
    this.isSyncing = false;
    this.forcedOffline = false;
    this.listeners = [];
    this.init();
  }

  init() {
    const settings = this.storage.getSettings();
    this.forcedOffline = !!settings.offlineMode;

    window.addEventListener('online', () => this.handleNetworkChange(true));
    window.addEventListener('offline', () => this.handleNetworkChange(false));

    // Auto-sync timer if enabled
    this.startAutoSync();
  }

  onStatusChange(fn) {
    this.listeners.push(fn);
  }

  notify(event, data) {
    this.listeners.forEach(fn => fn(event, data));
  }

  isOnline() {
    if (this.forcedOffline) return false;
    return navigator.onLine;
  }

  setForcedOffline(force) {
    this.forcedOffline = force;
    const settings = this.storage.getSettings();
    settings.offlineMode = force;
    this.storage.saveSettings(settings);
    this.notify('network_change', { online: this.isOnline() });
  }

  handleNetworkChange(online) {
    this.notify('network_change', { online: this.isOnline() });
    if (this.isOnline()) {
      this.syncAll();
    }
  }

  startAutoSync() {
    if (this.syncTimer) clearInterval(this.syncTimer);
    const settings = this.storage.getSettings();
    if (settings.autoSync) {
      const intervalMs = Math.max(15, settings.autoSyncIntervalSec || 60) * 1000;
      this.syncTimer = setInterval(() => {
        if (this.isOnline() && !this.isSyncing) {
          this.syncAll();
        }
      }, intervalMs);
    }
  }

  // Calculate live byte metrics for compose box
  calculatePayloadMetrics(to = '', cc = '', bcc = '', subject = '', body = '') {
    const textData = `${to}\n${cc}\n${bcc}\n${subject}\n${body}`;
    const rawBytes = new Blob([textData]).size;

    // Remote 2G / Satellite Speed Estimates:
    // 2G standard (9.6 kbps ~ 1.2 KB/s)
    // Satellite Iridium standard (2.4 kbps ~ 0.3 KB/s)
    const time2G = (rawBytes / 1200).toFixed(2);
    const timeSat = (rawBytes / 300).toFixed(2);

    // Theoretical LZ/Text compression saving estimate
    const estimatedCompressedBytes = Math.max(20, Math.round(rawBytes * 0.65));
    const savingsPercent = rawBytes > 0 ? Math.round(((rawBytes - estimatedCompressedBytes) / rawBytes) * 100) : 0;

    return {
      rawBytes,
      formattedSize: this.formatBytes(rawBytes),
      charCount: textData.length,
      time2GSec: time2G,
      timeSatSec: timeSat,
      compressedBytes: estimatedCompressedBytes,
      savingsPercent: Math.max(0, savingsPercent)
    };
  }

  formatBytes(bytes, decimals = 1) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  // Queue a newly composed message
  queueMessage(msgData) {
    const profile = this.storage.getProfile();
    const metrics = this.calculatePayloadMetrics(
      msgData.to,
      msgData.cc,
      msgData.bcc,
      msgData.subject,
      msgData.body
    );

    const newMsg = {
      id: 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      folder: 'outbox',
      from: profile.email || 'operator@remotestation.org',
      to: msgData.to.trim(),
      cc: (msgData.cc || '').trim(),
      bcc: (msgData.bcc || '').trim(),
      subject: msgData.subject.trim() || '(No Subject)',
      body: msgData.body || '',
      date: new Date().toISOString(),
      unread: false,
      sizeBytes: metrics.rawBytes,
      status: 'queued',
      retryCount: 0,
      starred: false
    };

    this.storage.addMessage(newMsg);
    this.notify('message_queued', newMsg);

    // If online, immediately attempt transmission
    if (this.isOnline()) {
      this.syncOutbox();
    }

    return newMsg;
  }

  // Main sync routine: sends Outbox + fetches remote Inbox
  async syncAll() {
    const outboxResult = await this.syncOutbox();
    const inboxResult = await this.syncInbox();
    return { outboxResult, inboxResult };
  }

  // Process all pending items in the Outbox
  async syncOutbox() {
    if (this.isSyncing) return { success: false, reason: 'already_syncing' };

    if (!this.isOnline()) {
      this.notify('sync_offline', { message: 'Cannot sync: Network is OFFLINE. Messages remain in Outbox.' });
      return { success: false, reason: 'offline' };
    }

    const outboxMessages = this.storage.getFolderMessages('outbox');
    if (outboxMessages.length === 0) {
      return { success: true, sentCount: 0 };
    }

    this.isSyncing = true;
    this.notify('sync_start', { count: outboxMessages.length });

    const settings = this.storage.getSettings();
    const provider = window.ProviderManager.getProvider(settings);

    let sentCount = 0;
    let totalBytesSent = 0;

    for (const msg of outboxMessages) {
      try {
        this.storage.updateMessage(msg.id, { status: 'sending' });
        this.notify('sync_progress', { messageId: msg.id, subject: msg.subject });

        const result = await provider.sendMail(msg);

        if (result.success) {
          // Successfully transmitted -> Move to Sent
          this.storage.updateMessage(msg.id, {
            folder: 'sent',
            status: 'synced',
            sentAt: new Date().toISOString(),
            providerUsed: result.provider
          });

          sentCount++;
          totalBytesSent += msg.sizeBytes;
        } else {
          // Failed -> Keep in outbox, mark failed
          this.storage.updateMessage(msg.id, {
            status: 'failed',
            retryCount: (msg.retryCount || 0) + 1,
            lastError: result.error || 'Failed to send'
          });
          this.notify('sync_error', { messageId: msg.id, error: result.error });
        }
      } catch (err) {
        this.storage.updateMessage(msg.id, {
          status: 'failed',
          retryCount: (msg.retryCount || 0) + 1,
          lastError: err.message
        });
        this.notify('sync_error', { messageId: msg.id, error: err.message });
      }
    }

    if (totalBytesSent > 0) {
      this.storage.recordTraffic(totalBytesSent, 0);
    }

    this.isSyncing = false;
    this.notify('sync_complete', {
      sentCount,
      totalBytesSent,
      formattedBytes: this.formatBytes(totalBytesSent)
    });

    return { success: true, sentCount, totalBytesSent };
  }

  // Fetch incoming emails from real Gmail or Outlook
  async syncInbox(limit = 10) {
    if (!this.isOnline()) return { success: false, reason: 'offline' };

    const settings = this.storage.getSettings();
    const mode = settings.providerMode || settings.gatewayMode;
    if (mode === 'simulation') {
      return { success: true, newCount: 0 };
    }

    const provider = window.ProviderManager.getProvider(settings);

    try {
      this.notify('inbox_fetch_start', { provider: mode });
      const result = await provider.fetchInbox(limit);

      if (result.success && Array.isArray(result.messages)) {
        const addedCount = this.storage.mergeIncomingMessages(result.messages);
        const bytes = result.bytesTransferred || 0;

        if (bytes > 0) {
          this.storage.recordTraffic(0, bytes);
        }

        this.notify('inbox_fetch_complete', {
          addedCount,
          bytesTransferred: bytes,
          formattedBytes: this.formatBytes(bytes)
        });

        return { success: true, addedCount, bytesTransferred: bytes };
      } else {
        this.notify('inbox_fetch_error', { error: result.error });
        return { success: false, error: result.error };
      }
    } catch (e) {
      this.notify('inbox_fetch_error', { error: e.message });
      return { success: false, error: e.message };
    }
  }

  // Simulate receiving an incoming text ping/message from remote base
  simulateIncomingMessage(customSender = null, customSubject = null, customBody = null) {
    const profile = this.storage.getProfile();
    const subjects = [
      'Base Camp Telemetry Sync: Normal',
      'Satellite Pass Notification (Next: 04:15 UTC)',
      'Solar Storm Advisory (Low Impact Expected)',
      'Quarterly Medical Inventory Ping'
    ];
    const senders = [
      'relay-gateway@satellite-mesh.net',
      'operations@basecamp-north.org',
      'space-weather@noaa-relay.gov',
      'coordinator@field-response.org'
    ];

    const rnd = Math.floor(Math.random() * subjects.length);
    const subject = customSubject || subjects[rnd];
    const from = customSender || senders[rnd];
    const body = customBody || `AUTOMATED PACKET DISPATCH [P-${Math.floor(Math.random() * 9000 + 1000)}]
Timestamp: ${new Date().toUTCString()}
Station Target: ${profile.stationId || 'ECHO-4'}

Telemetry status normal. All transponders operating within expected power bands.
No urgent action required.

End of Transmission.`;

    const sizeBytes = new Blob([subject + from + body]).size;

    const newMsg = {
      id: 'msg-in-' + Date.now(),
      folder: 'inbox',
      from: from,
      to: profile.email || 'operator@remotestation.org',
      cc: '',
      bcc: '',
      subject: subject,
      body: body,
      date: new Date().toISOString(),
      unread: true,
      sizeBytes: sizeBytes,
      status: 'synced',
      starred: false
    };

    this.storage.addMessage(newMsg);
    this.storage.recordTraffic(0, sizeBytes);
    this.notify('message_received', newMsg);
    return newMsg;
  }
}

// Global instance
window.syncEngine = new SyncEngine(window.mailStorage);
