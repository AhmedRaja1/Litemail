/**
 * LiteMail Application Controller
 * Handles UI interactions, folder navigation, message viewing, composing,
 * shortcuts, search, templates, real Gmail/Outlook provider integration, and telemetry display.
 */

class LiteMailApp {
  constructor() {
    this.storage = window.mailStorage;
    this.sync = window.syncEngine;
    
    this.currentFolder = 'inbox';
    this.currentFilter = 'all';
    this.searchQuery = '';
    this.selectedMessageId = null;
    this.draftTimer = null;
    
    this.init();
  }

  init() {
    this.applySettings();
    this.bindEvents();
    this.bindKeyboardShortcuts();
    this.setupSyncListener();
    this.renderAll();

    // Check if there is an unsaved draft
    const savedDraft = this.storage.loadDraft();
    if (savedDraft && (savedDraft.to || savedDraft.subject || savedDraft.body)) {
      this.showToast('Unsaved draft restored', 'info');
    }
  }

  // Apply user theme and font preferences to DOM
  applySettings() {
    const settings = this.storage.getSettings();
    document.body.setAttribute('data-theme', settings.theme || 'dark');
    document.body.setAttribute('data-fontsize', settings.fontSize || 'medium');
    this.updateNetworkBadge();
    this.updateProviderBadge();
  }

  updateProviderBadge() {
    const settings = this.storage.getSettings();
    const mode = settings.providerMode || settings.gatewayMode || 'simulation';
    const badge = document.getElementById('activeProviderBadge');
    if (badge) {
      badge.textContent = mode.toUpperCase();
      if (mode === 'gmail') {
        badge.style.color = '#ef4444';
        badge.style.borderColor = 'rgba(239, 68, 68, 0.4)';
      } else if (mode === 'outlook') {
        badge.style.color = '#38bdf8';
        badge.style.borderColor = 'rgba(56, 189, 248, 0.4)';
      } else if (mode === 'relay') {
        badge.style.color = '#10b981';
        badge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
      } else {
        badge.style.color = 'var(--text-muted)';
        badge.style.borderColor = 'var(--border-color)';
      }
    }
  }

  // DOM Event Listeners
  bindEvents() {
    // Folder navigation
    document.querySelectorAll('.folder-item').forEach(el => {
      el.addEventListener('click', (e) => {
        const folder = el.getAttribute('data-folder');
        this.switchFolder(folder);
      });
    });

    // Filter pills (All, Unread, Starred)
    document.querySelectorAll('.filter-pill').forEach(el => {
      el.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
        el.classList.add('active');
        this.currentFilter = el.getAttribute('data-filter');
        this.renderMessageList();
      });
    });

    // Search input
    const searchInput = document.getElementById('searchInput');
    const searchClear = document.getElementById('searchClear');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        searchClear.style.display = this.searchQuery ? 'block' : 'none';
        this.renderMessageList();
      });
      searchClear.addEventListener('click', () => {
        searchInput.value = '';
        this.searchQuery = '';
        searchClear.style.display = 'none';
        this.renderMessageList();
        searchInput.focus();
      });
    }

    // Header buttons
    document.getElementById('btnCompose').addEventListener('click', () => this.openComposer());
    document.getElementById('btnSync').addEventListener('click', () => this.triggerSync());
    document.getElementById('btnSimulateIn').addEventListener('click', () => this.simulateIncoming());
    document.getElementById('btnSettings').addEventListener('click', () => this.openSettings());
    document.getElementById('btnShortcuts').addEventListener('click', () => this.openShortcutsModal());
    document.getElementById('networkBadge').addEventListener('click', () => this.toggleNetworkState());

    // Theme toggle button in header
    const btnThemeToggle = document.getElementById('btnThemeToggle');
    if (btnThemeToggle) {
      btnThemeToggle.addEventListener('click', () => this.cycleTheme());
    }

    // Composer controls
    document.getElementById('btnCcToggle').addEventListener('click', () => this.toggleField('composeCcRow'));
    document.getElementById('btnBccToggle').addEventListener('click', () => this.toggleField('composeBccRow'));
    document.getElementById('btnSendMsg').addEventListener('click', () => this.handleSendMessage());
    document.getElementById('btnSaveDraft').addEventListener('click', () => this.handleSaveDraft());
    document.getElementById('btnDiscardDraft').addEventListener('click', () => this.handleDiscardDraft());
    document.getElementById('btnCloseComposer').addEventListener('click', () => this.closeComposer());

    // Live byte & telemetry counter on compose inputs
    const composeInputs = ['composeTo', 'composeCc', 'composeBcc', 'composeSubject', 'composeBody'];
    composeInputs.forEach(id => {
      const inputEl = document.getElementById(id);
      if (inputEl) {
        inputEl.addEventListener('input', () => {
          this.updateComposerByteCount();
          this.autoSaveDraftDebounced();
        });
      }
    });

    // Quick Templates dropdown
    const templateSelect = document.getElementById('templateSelect');
    if (templateSelect) {
      templateSelect.addEventListener('change', (e) => {
        this.applyTemplate(e.target.value);
        e.target.value = '';
      });
    }

    // Viewer Actions
    document.getElementById('btnReply').addEventListener('click', () => this.replyToCurrent(false));
    document.getElementById('btnReplyAll').addEventListener('click', () => this.replyToCurrent(true));
    document.getElementById('btnForward').addEventListener('click', () => this.forwardCurrent());
    document.getElementById('btnDelete').addEventListener('click', () => this.deleteCurrent());
    document.getElementById('btnToggleStar').addEventListener('click', () => this.toggleStarCurrent());
    document.getElementById('btnExportTxt').addEventListener('click', () => this.exportCurrent('txt'));
    document.getElementById('btnExportEml').addEventListener('click', () => this.exportCurrent('eml'));
    document.getElementById('btnMobileBack').addEventListener('click', () => this.closeMobileViewer());

    // Settings Modal controls
    document.getElementById('btnCloseSettings').addEventListener('click', () => this.closeSettings());
    document.getElementById('btnSaveSettings').addEventListener('click', () => this.saveSettingsFromModal());
    document.getElementById('btnExportBackup').addEventListener('click', () => this.exportBackupFile());
    document.getElementById('btnImportBackup').addEventListener('click', () => document.getElementById('importFileInput').click());
    document.getElementById('importFileInput').addEventListener('change', (e) => this.handleImportBackup(e));
    document.getElementById('btnResetDemo').addEventListener('click', () => this.handleResetDemo());
    document.getElementById('btnCloseShortcuts').addEventListener('click', () => this.closeShortcutsModal());

    // Provider switching in Settings Modal
    const providerSelect = document.getElementById('settingProviderMode');
    if (providerSelect) {
      providerSelect.addEventListener('change', (e) => this.handleProviderChange(e.target.value));
    }

    // Real API Test Connection Buttons
    document.getElementById('btnTestGmail').addEventListener('click', () => this.testGmailConnection());
    document.getElementById('btnTestOutlook').addEventListener('click', () => this.testOutlookConnection());
  }

  handleProviderChange(mode) {
    document.getElementById('panelGmailConfig').style.display = mode === 'gmail' ? 'block' : 'none';
    document.getElementById('panelOutlookConfig').style.display = mode === 'outlook' ? 'block' : 'none';
    document.getElementById('panelRelayConfig').style.display = mode === 'relay' ? 'block' : 'none';
  }

  async testGmailConnection() {
    const token = document.getElementById('settingGmailToken').value.trim();
    const statusMsg = document.getElementById('gmailStatusMsg');
    
    if (!token) {
      statusMsg.innerHTML = '<span style="color:#ef4444;">Please paste an OAuth Access Token first.</span>';
      return;
    }

    statusMsg.innerHTML = '<span style="color:var(--text-accent);">Connecting to Gmail REST API...</span>';
    
    const provider = new window.GmailProvider({ accessToken: token });
    const result = await provider.testConnection();

    if (result.success) {
      statusMsg.innerHTML = `<span style="color:#10b981;">✓ Connected! Verified account: <strong>${result.email}</strong> (${result.messagesTotal} total msgs in Gmail)</span>`;
      document.getElementById('settingEmail').value = result.email;
      this.showToast(`Gmail account connected: ${result.email}`, 'success');
    } else {
      statusMsg.innerHTML = `<span style="color:#ef4444;">✕ Connection Failed: ${this.escapeHtml(result.error)}</span>`;
      this.showToast('Gmail authorization failed: ' + result.error, 'error');
    }
  }

  async testOutlookConnection() {
    const token = document.getElementById('settingOutlookToken').value.trim();
    const statusMsg = document.getElementById('outlookStatusMsg');
    
    if (!token) {
      statusMsg.innerHTML = '<span style="color:#ef4444;">Please paste an OAuth Access Token first.</span>';
      return;
    }

    statusMsg.innerHTML = '<span style="color:var(--text-accent);">Connecting to Microsoft Graph API...</span>';
    
    const provider = new window.OutlookProvider({ accessToken: token });
    const result = await provider.testConnection();

    if (result.success) {
      statusMsg.innerHTML = `<span style="color:#10b981;">✓ Connected! User: <strong>${result.name}</strong> (${result.email})</span>`;
      document.getElementById('settingName').value = result.name;
      document.getElementById('settingEmail').value = result.email;
      this.showToast(`Outlook connected: ${result.email}`, 'success');
    } else {
      statusMsg.innerHTML = `<span style="color:#ef4444;">✕ Connection Failed: ${this.escapeHtml(result.error)}</span>`;
      this.showToast('Outlook authorization failed: ' + result.error, 'error');
    }
  }

  // Keyboard Shortcuts Handler
  bindKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);

      if (e.ctrlKey && e.key === 'Enter') {
        const composerModal = document.getElementById('composerModal');
        if (!composerModal.classList.contains('hidden')) {
          e.preventDefault();
          this.handleSendMessage();
          return;
        }
      }

      if (e.key === 'Escape') {
        const composerModal = document.getElementById('composerModal');
        const settingsModal = document.getElementById('settingsModal');
        const shortcutsModal = document.getElementById('shortcutsModal');
        if (!composerModal.classList.contains('hidden')) {
          this.closeComposer();
        } else if (!settingsModal.classList.contains('hidden')) {
          this.closeSettings();
        } else if (!shortcutsModal.classList.contains('hidden')) {
          this.closeShortcutsModal();
        } else {
          this.closeMobileViewer();
        }
        return;
      }

      if (isInput) return;

      switch (e.key.toLowerCase()) {
        case 'c':
          e.preventDefault();
          this.openComposer();
          break;
        case '/':
          e.preventDefault();
          const search = document.getElementById('searchInput');
          if (search) search.focus();
          break;
        case 'j':
          e.preventDefault();
          this.navigateMessage(1);
          break;
        case 'k':
          e.preventDefault();
          this.navigateMessage(-1);
          break;
        case 'd':
          e.preventDefault();
          this.deleteCurrent();
          break;
        case 'r':
          e.preventDefault();
          this.replyToCurrent(false);
          break;
        case 'a':
          e.preventDefault();
          this.replyToCurrent(true);
          break;
        case 's':
          e.preventDefault();
          this.toggleStarCurrent();
          break;
        case '?':
          e.preventDefault();
          this.openShortcutsModal();
          break;
      }
    });
  }

  // Sync and Network Events Hook
  setupSyncListener() {
    this.sync.onStatusChange((event, data) => {
      if (event === 'network_change') {
        this.updateNetworkBadge();
        this.showToast(data.online ? 'Network status: ONLINE' : 'Network status: OFFLINE (Low-bandwidth queue active)', data.online ? 'success' : 'warning');
      } else if (event === 'sync_start') {
        this.showToast(`Transmitting ${data.count} pending messages...`, 'info');
        document.getElementById('btnSync').classList.add('syncing');
      } else if (event === 'sync_complete') {
        document.getElementById('btnSync').classList.remove('syncing');
        this.showToast(`Outbox synced! ${data.sentCount} message(s) sent (${data.formattedBytes})`, 'success');
        this.renderAll();
      } else if (event === 'inbox_fetch_start') {
        this.showToast(`Fetching latest text emails from ${data.provider.toUpperCase()}...`, 'info');
      } else if (event === 'inbox_fetch_complete') {
        if (data.addedCount > 0) {
          this.showToast(`Received ${data.addedCount} new plain-text email(s) (${data.formattedBytes})`, 'success');
        } else {
          this.showToast(`Inbox is up to date (${data.formattedBytes} checked)`, 'info');
        }
        this.renderAll();
      } else if (event === 'inbox_fetch_error') {
        this.showToast(`Failed to fetch inbox: ${data.error}`, 'error');
      } else if (event === 'sync_offline') {
        this.showToast(data.message, 'warning');
      } else if (event === 'message_received') {
        this.showToast(`Incoming text message: "${data.subject}"`, 'success');
        this.renderAll();
      } else if (event === 'message_queued') {
        this.renderFolderCounts();
        if (this.currentFolder === 'outbox') this.renderMessageList();
      }
    });
  }

  // --- Rendering UI ---

  renderAll() {
    this.renderSidebarProfile();
    this.renderFolderCounts();
    this.renderMessageList();
    this.renderViewer();
    this.renderTelemetry();
    this.updateProviderBadge();
  }

  renderSidebarProfile() {
    const profile = this.storage.getProfile();
    document.getElementById('sidebarProfileName').textContent = profile.name || 'Field Operator';
    document.getElementById('sidebarProfileEmail').textContent = profile.email || 'operator@remotestation.org';
  }

  renderFolderCounts() {
    const counts = this.storage.getFolderCounts();
    
    const inboxBadge = document.getElementById('inboxBadge');
    if (inboxBadge) {
      if (counts.inboxUnread > 0) {
        inboxBadge.textContent = counts.inboxUnread;
        inboxBadge.className = 'folder-count badge-unread';
        inboxBadge.style.display = 'inline-block';
      } else {
        inboxBadge.style.display = 'none';
      }
    }

    const outboxBadge = document.getElementById('outboxBadge');
    if (outboxBadge) {
      if (counts.outboxCount > 0) {
        outboxBadge.textContent = counts.outboxCount;
        outboxBadge.className = 'folder-count badge-outbox';
        outboxBadge.style.display = 'inline-block';
      } else {
        outboxBadge.style.display = 'none';
      }
    }

    const draftsBadge = document.getElementById('draftsBadge');
    if (draftsBadge) {
      if (counts.draftsCount > 0) {
        draftsBadge.textContent = counts.draftsCount;
        draftsBadge.className = 'folder-count';
        draftsBadge.style.display = 'inline-block';
      } else {
        draftsBadge.style.display = 'none';
      }
    }
  }

  renderMessageList() {
    const messages = this.storage.getFolderMessages(this.currentFolder, this.searchQuery, this.currentFilter);
    const container = document.getElementById('messagesList');
    container.innerHTML = '';

    if (messages.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📭</div>
          <div style="font-weight: 600; margin-bottom: 4px;">No messages found</div>
          <div style="font-size: 0.75rem;">This folder is currently empty.</div>
        </div>
      `;
      if (this.selectedMessageId && !this.storage.getMessage(this.selectedMessageId)) {
        this.selectedMessageId = null;
        this.renderViewer();
      }
      return;
    }

    if (!this.selectedMessageId || !messages.some(m => m.id === this.selectedMessageId)) {
      this.selectedMessageId = messages[0].id;
    }

    messages.forEach(msg => {
      const li = document.createElement('li');
      li.className = `message-item ${msg.unread ? 'unread' : ''} ${msg.id === this.selectedMessageId ? 'active' : ''}`;
      li.setAttribute('data-id', msg.id);

      const senderOrRecipient = this.currentFolder === 'sent' || this.currentFolder === 'outbox' 
        ? `To: ${msg.to || '(No recipient)'}`
        : (msg.from || 'Unknown Sender');

      const dateStr = this.formatDate(msg.date);
      const byteStr = this.sync.formatBytes(msg.sizeBytes || 0);

      let statusBadge = '';
      if (this.currentFolder === 'outbox') {
        const s = msg.status || 'queued';
        statusBadge = `<span class="msg-status-badge ${s}">${s}</span>`;
      }

      li.innerHTML = `
        <div class="msg-top-row">
          <span class="msg-from">${this.escapeHtml(senderOrRecipient)}</span>
          <span class="msg-date">${dateStr}</span>
        </div>
        <div class="msg-subject">${this.escapeHtml(msg.subject || '(No Subject)')}</div>
        <div class="msg-snippet">${this.escapeHtml((msg.body || '').replace(/\n+/g, ' ').slice(0, 75))}</div>
        <div class="msg-meta-row">
          <span class="msg-byte-badge">${byteStr}</span>
          <div>
            ${statusBadge}
            ${msg.starred ? '<span style="color: #f59e0b; margin-left: 4px;">★</span>' : ''}
          </div>
        </div>
      `;

      li.addEventListener('click', () => {
        this.selectMessage(msg.id);
      });

      container.appendChild(li);
    });

    this.renderViewer();
  }

  renderViewer() {
    const emptyViewer = document.getElementById('viewerEmpty');
    const contentViewer = document.getElementById('viewerContent');

    if (!this.selectedMessageId) {
      emptyViewer.style.display = 'flex';
      contentViewer.style.display = 'none';
      return;
    }

    const msg = this.storage.getMessage(this.selectedMessageId);
    if (!msg) {
      emptyViewer.style.display = 'flex';
      contentViewer.style.display = 'none';
      return;
    }

    emptyViewer.style.display = 'none';
    contentViewer.style.display = 'flex';

    if (msg.unread) {
      this.storage.markRead(msg.id, false);
      this.renderFolderCounts();
      const listEl = document.querySelector(`.message-item[data-id="${msg.id}"]`);
      if (listEl) listEl.classList.remove('unread');
    }

    document.getElementById('viewSubject').textContent = msg.subject || '(No Subject)';
    document.getElementById('viewFrom').textContent = msg.from || 'Anonymous';
    document.getElementById('viewTo').textContent = msg.to || '(None)';
    
    const ccRow = document.getElementById('viewCcRow');
    if (msg.cc) {
      ccRow.style.display = 'flex';
      document.getElementById('viewCc').textContent = msg.cc;
    } else {
      ccRow.style.display = 'none';
    }

    document.getElementById('viewDate').textContent = new Date(msg.date).toLocaleString();
    document.getElementById('viewSize').textContent = `${msg.sizeBytes || 0} Bytes (${this.sync.formatBytes(msg.sizeBytes || 0)})`;

    const starBtn = document.getElementById('btnToggleStar');
    starBtn.textContent = msg.starred ? '★ Starred' : '☆ Star';
    starBtn.style.color = msg.starred ? '#f59e0b' : '';

    document.getElementById('viewBody').textContent = msg.body || '';

    const delBtn = document.getElementById('btnDelete');
    if (msg.folder === 'trash') {
      delBtn.textContent = '🗑 Delete Permanently';
    } else {
      delBtn.textContent = '🗑 Delete';
    }
  }

  renderTelemetry() {
    const stats = this.storage.getStats();
    const totalBytes = (stats.totalSentBytes || 0) + (stats.totalReceivedBytes || 0);
    const sessionBytes = (stats.sessionSentBytes || 0) + (stats.sessionReceivedBytes || 0);

    const el = document.getElementById('telemetryCounter');
    if (el) {
      el.innerHTML = `Data: <strong>${this.sync.formatBytes(totalBytes)}</strong> · Session: <strong>${this.sync.formatBytes(sessionBytes)}</strong>`;
    }
  }

  updateNetworkBadge() {
    const isOnline = this.sync.isOnline();
    const badge = document.getElementById('networkBadge');
    const label = document.getElementById('networkLabel');

    if (isOnline) {
      badge.className = 'network-badge';
      label.textContent = 'ONLINE (LOW-BW)';
    } else {
      badge.className = 'network-badge offline';
      label.textContent = 'OFFLINE (QUEUED)';
    }
  }

  // --- Folder & Message Actions ---

  switchFolder(folder) {
    this.currentFolder = folder;
    document.querySelectorAll('.folder-item').forEach(el => {
      el.classList.toggle('active', el.getAttribute('data-folder') === folder);
    });

    const folderTitle = document.getElementById('currentFolderTitle');
    if (folderTitle) {
      folderTitle.textContent = folder.toUpperCase();
    }

    this.selectedMessageId = null;
    this.renderMessageList();
  }

  selectMessage(id) {
    this.selectedMessageId = id;
    document.querySelectorAll('.message-item').forEach(el => {
      el.classList.toggle('active', el.getAttribute('data-id') === id);
    });
    this.renderViewer();

    const viewerPane = document.getElementById('viewerPane');
    if (viewerPane && window.innerWidth <= 640) {
      viewerPane.classList.add('mobile-active');
    }
  }

  closeMobileViewer() {
    const viewerPane = document.getElementById('viewerPane');
    if (viewerPane) {
      viewerPane.classList.remove('mobile-active');
    }
  }

  navigateMessage(delta) {
    const messages = this.storage.getFolderMessages(this.currentFolder, this.searchQuery, this.currentFilter);
    if (messages.length === 0) return;

    const currentIndex = messages.findIndex(m => m.id === this.selectedMessageId);
    let nextIndex = currentIndex + delta;
    if (nextIndex < 0) nextIndex = 0;
    if (nextIndex >= messages.length) nextIndex = messages.length - 1;

    this.selectMessage(messages[nextIndex].id);
  }

  deleteCurrent() {
    if (!this.selectedMessageId) return;
    const msg = this.storage.getMessage(this.selectedMessageId);
    if (!msg) return;

    this.storage.deleteMessage(this.selectedMessageId);
    this.showToast(msg.folder === 'trash' ? 'Message deleted permanently' : 'Message moved to Trash', 'info');
    this.selectedMessageId = null;
    this.renderAll();
  }

  toggleStarCurrent() {
    if (!this.selectedMessageId) return;
    const updated = this.storage.toggleStar(this.selectedMessageId);
    if (updated) {
      this.renderViewer();
      this.renderFolderCounts();
      const itemEl = document.querySelector(`.message-item[data-id="${this.selectedMessageId}"]`);
      if (itemEl) {
        this.renderMessageList();
      }
    }
  }

  replyToCurrent(replyAll = false) {
    if (!this.selectedMessageId) return;
    const msg = this.storage.getMessage(this.selectedMessageId);
    if (!msg) return;

    const to = msg.from;
    const cc = replyAll ? msg.cc : '';
    const subject = msg.subject.startsWith('Re:') ? msg.subject : `Re: ${msg.subject}`;
    
    const quoteHeader = `\n\n--- On ${new Date(msg.date).toLocaleString()}, ${msg.from} wrote ---\n`;
    const quotedBody = (msg.body || '').split('\n').map(l => `> ${l}`).join('\n');
    const body = `${quoteHeader}${quotedBody}`;

    this.openComposer({ to, cc, subject, body });
  }

  forwardCurrent() {
    if (!this.selectedMessageId) return;
    const msg = this.storage.getMessage(this.selectedMessageId);
    if (!msg) return;

    const subject = msg.subject.startsWith('Fwd:') ? msg.subject : `Fwd: ${msg.subject}`;
    const header = `\n\n---------- Forwarded message ---------\nFrom: ${msg.from}\nDate: ${new Date(msg.date).toLocaleString()}\nSubject: ${msg.subject}\nTo: ${msg.to}\n\n`;
    const body = `${header}${msg.body || ''}`;

    this.openComposer({ to: '', cc: '', subject, body });
  }

  exportCurrent(format = 'txt') {
    if (!this.selectedMessageId) return;
    const msg = this.storage.getMessage(this.selectedMessageId);
    if (!msg) return;

    let content, filename, mimeType;
    if (format === 'eml') {
      content = this.storage.exportMessageAsEml(msg.id);
      filename = `email_${msg.id}.eml`;
      mimeType = 'message/rfc822';
    } else {
      content = this.storage.exportMessageAsTxt(msg.id);
      filename = `email_${msg.id}.txt`;
      mimeType = 'text/plain;charset=utf-8';
    }

    this.downloadFile(filename, content, mimeType);
    this.showToast(`Exported ${filename} for offline sneakernet transfer`, 'success');
  }

  // --- Composer Logic ---

  openComposer(prefill = null) {
    const modal = document.getElementById('composerModal');
    modal.classList.remove('hidden');

    const toInput = document.getElementById('composeTo');
    const ccInput = document.getElementById('composeCc');
    const bccInput = document.getElementById('composeBcc');
    const subjectInput = document.getElementById('composeSubject');
    const bodyInput = document.getElementById('composeBody');

    if (prefill) {
      toInput.value = prefill.to || '';
      ccInput.value = prefill.cc || '';
      bccInput.value = prefill.bcc || '';
      subjectInput.value = prefill.subject || '';
      bodyInput.value = prefill.body || '';
    } else {
      const draft = this.storage.loadDraft();
      if (draft) {
        toInput.value = draft.to || '';
        ccInput.value = draft.cc || '';
        bccInput.value = draft.bcc || '';
        subjectInput.value = draft.subject || '';
        bodyInput.value = draft.body || '';
      } else {
        toInput.value = '';
        ccInput.value = '';
        bccInput.value = '';
        subjectInput.value = '';
        bodyInput.value = '';
      }
    }

    if (ccInput.value) document.getElementById('composeCcRow').style.display = 'flex';
    if (bccInput.value) document.getElementById('composeBccRow').style.display = 'flex';

    this.updateComposerByteCount();

    if (!toInput.value) {
      toInput.focus();
    } else {
      bodyInput.focus();
      bodyInput.setSelectionRange(0, 0);
    }
  }

  closeComposer() {
    this.autoSaveDraftNow();
    document.getElementById('composerModal').classList.add('hidden');
  }

  toggleField(rowId) {
    const row = document.getElementById(rowId);
    if (row) {
      row.style.display = row.style.display === 'none' || !row.style.display ? 'flex' : 'none';
      if (row.style.display === 'flex') {
        const input = row.querySelector('input');
        if (input) input.focus();
      }
    }
  }

  updateComposerByteCount() {
    const to = document.getElementById('composeTo').value;
    const cc = document.getElementById('composeCc').value;
    const bcc = document.getElementById('composeBcc').value;
    const subject = document.getElementById('composeSubject').value;
    const body = document.getElementById('composeBody').value;

    const metrics = this.sync.calculatePayloadMetrics(to, cc, bcc, subject, body);

    const meterEl = document.getElementById('payloadMeter');
    if (meterEl) {
      meterEl.innerHTML = `Payload: <strong>${metrics.formattedSize}</strong> (${metrics.rawBytes} B) · Est. 2G: <strong>~${metrics.time2GSec}s</strong>`;
    }
  }

  autoSaveDraftDebounced() {
    if (this.draftTimer) clearTimeout(this.draftTimer);
    this.draftTimer = setTimeout(() => {
      this.autoSaveDraftNow();
    }, 1500);
  }

  autoSaveDraftNow() {
    const to = document.getElementById('composeTo').value;
    const cc = document.getElementById('composeCc').value;
    const bcc = document.getElementById('composeBcc').value;
    const subject = document.getElementById('composeSubject').value;
    const body = document.getElementById('composeBody').value;

    if (to || subject || body) {
      this.storage.saveDraft({ to, cc, bcc, subject, body });
    }
  }

  handleSendMessage() {
    const to = document.getElementById('composeTo').value.trim();
    const cc = document.getElementById('composeCc').value.trim();
    const bcc = document.getElementById('composeBcc').value.trim();
    const subject = document.getElementById('composeSubject').value.trim();
    const body = document.getElementById('composeBody').value;

    if (!to) {
      this.showToast('Please specify a recipient (To field)', 'error');
      document.getElementById('composeTo').focus();
      return;
    }

    const newMsg = this.sync.queueMessage({ to, cc, bcc, subject, body });
    this.storage.clearDraft();

    document.getElementById('composerModal').classList.add('hidden');

    if (this.sync.isOnline()) {
      this.showToast('Transmitting plain-text message...', 'info');
    } else {
      this.showToast('Offline: Message stored in Outbox. Will transmit upon connection.', 'warning');
      this.switchFolder('outbox');
    }

    this.renderAll();
  }

  handleSaveDraft() {
    this.autoSaveDraftNow();
    this.storage.addMessage({
      id: 'draft-' + Date.now(),
      folder: 'drafts',
      from: this.storage.getProfile().email,
      to: document.getElementById('composeTo').value,
      cc: document.getElementById('composeCc').value,
      bcc: document.getElementById('composeBcc').value,
      subject: document.getElementById('composeSubject').value || '(Draft)',
      body: document.getElementById('composeBody').value,
      date: new Date().toISOString(),
      unread: false,
      sizeBytes: 0,
      status: 'synced',
      starred: false
    });
    this.storage.clearDraft();
    document.getElementById('composerModal').classList.add('hidden');
    this.showToast('Draft saved to Drafts folder', 'success');
    this.renderAll();
  }

  handleDiscardDraft() {
    if (confirm('Are you sure you want to discard this draft?')) {
      this.storage.clearDraft();
      document.getElementById('composerModal').classList.add('hidden');
      this.showToast('Draft discarded', 'info');
    }
  }

  applyTemplate(type) {
    const profile = this.storage.getProfile();
    const bodyEl = document.getElementById('composeBody');
    const subjectEl = document.getElementById('composeSubject');

    let tSubject = '';
    let tBody = '';

    switch (type) {
      case 'sitrep':
        tSubject = `DAILY SITREP: Station ${profile.stationId || 'Echo'} - ${new Date().toISOString().split('T')[0]}`;
        tBody = `DAILY SITUATION REPORT
Station: ${profile.stationId || 'Echo'}
Operator: ${profile.name || 'Field Op'}
Status: Operational

1. SYSTEMS & POWER:
- Battery/Solar: OK (100%)
- Generator Fuel: [X] Liters remaining

2. WEATHER & OBSERVATIONS:
- Temp: [X] C, Barometer: [X] hPa

3. INCIDENTS / REMARKS:
- None. All personnel healthy.`;
        break;

      case 'weather':
        tSubject = `MET REPORT: Immediate Observation Sector ${profile.stationId || 'Echo'}`;
        tBody = `METEOROLOGICAL OBSERVATION:
Time: ${new Date().toUTCString()}
Wind Speed / Dir: [ ] kts [ ]
Visibility: [ ] km
Precipitation: [ ]
Barometric Trend: [ ]`;
        break;

      case 'supplies':
        tSubject = `LOGISTICS REQUEST: Critical spares / supplies`;
        tBody = `RESUPPLY REQUISITION:
Station ID: ${profile.stationId || 'Echo'}
Priority Level: [Urgent / Routine]

Items Requested:
1. [Item Name] - Qty: [ ] - Part #: [ ]
2. [Item Name] - Qty: [ ] - Part #: [ ]

Justification: [Brief text justification]`;
        break;

      case 'ping':
        tSubject = `COMMS CHECK / PING`;
        tBody = `RADIO / SATELLITE COMMS CHECK
Timestamp: ${new Date().toUTCString()}
Acknowledge receipt with single-line pong.`;
        break;
    }

    if (tSubject && !subjectEl.value) subjectEl.value = tSubject;
    if (tBody) {
      bodyEl.value = bodyEl.value ? `${bodyEl.value}\n\n${tBody}` : tBody;
    }

    this.updateComposerByteCount();
  }

  // --- Network, Sync & Simulation Controls ---

  triggerSync() {
    this.sync.syncAll();
  }

  simulateIncoming() {
    this.sync.simulateIncomingMessage();
  }

  toggleNetworkState() {
    const currentState = this.sync.isOnline();
    this.sync.setForcedOffline(currentState);
  }

  cycleTheme() {
    const current = document.body.getAttribute('data-theme') || 'dark';
    const themes = ['dark', 'light', 'solar'];
    const nextIndex = (themes.indexOf(current) + 1) % themes.length;
    const nextTheme = themes[nextIndex];
    
    document.body.setAttribute('data-theme', nextTheme);
    const settings = this.storage.getSettings();
    settings.theme = nextTheme;
    this.storage.saveSettings(settings);

    this.showToast(`Theme switched to ${nextTheme.toUpperCase()}`, 'info');
  }

  // --- Settings & Real Account Management ---

  openSettings() {
    const profile = this.storage.getProfile();
    const settings = this.storage.getSettings();
    const mode = settings.providerMode || settings.gatewayMode || 'simulation';

    document.getElementById('settingName').value = profile.name || '';
    document.getElementById('settingEmail').value = profile.email || '';
    document.getElementById('settingStationId').value = profile.stationId || '';
    
    document.getElementById('settingProviderMode').value = mode;
    this.handleProviderChange(mode);

    document.getElementById('settingGmailToken').value = settings.gmailAccessToken || '';
    document.getElementById('settingOutlookToken').value = settings.outlookAccessToken || '';
    document.getElementById('settingGatewayUrl').value = settings.gatewayUrl || '';
    document.getElementById('settingGatewayApiKey').value = settings.gatewayApiKey || '';

    document.getElementById('settingTheme').value = settings.theme || 'dark';
    document.getElementById('settingFontSize').value = settings.fontSize || 'medium';
    document.getElementById('settingAutoSync').checked = !!settings.autoSync;

    document.getElementById('gmailStatusMsg').innerHTML = '';
    document.getElementById('outlookStatusMsg').innerHTML = '';

    document.getElementById('settingsModal').classList.remove('hidden');
  }

  closeSettings() {
    document.getElementById('settingsModal').classList.add('hidden');
  }

  saveSettingsFromModal() {
    const profile = {
      name: document.getElementById('settingName').value.trim(),
      email: document.getElementById('settingEmail').value.trim(),
      stationId: document.getElementById('settingStationId').value.trim()
    };

    const providerMode = document.getElementById('settingProviderMode').value;

    const settings = this.storage.getSettings();
    settings.providerMode = providerMode;
    settings.gatewayMode = providerMode;
    settings.gmailAccessToken = document.getElementById('settingGmailToken').value.trim();
    settings.outlookAccessToken = document.getElementById('settingOutlookToken').value.trim();
    settings.gatewayUrl = document.getElementById('settingGatewayUrl').value.trim();
    settings.gatewayApiKey = document.getElementById('settingGatewayApiKey').value.trim();
    
    settings.theme = document.getElementById('settingTheme').value;
    settings.fontSize = document.getElementById('settingFontSize').value;
    settings.autoSync = document.getElementById('settingAutoSync').checked;

    this.storage.saveProfile(profile);
    this.storage.saveSettings(settings);

    this.applySettings();
    this.closeSettings();
    this.renderAll();
    this.showToast(`Provider set to ${providerMode.toUpperCase()} & settings saved!`, 'success');
  }

  openShortcutsModal() {
    document.getElementById('shortcutsModal').classList.remove('hidden');
  }

  closeShortcutsModal() {
    document.getElementById('shortcutsModal').classList.add('hidden');
  }

  exportBackupFile() {
    const jsonStr = this.storage.exportBackupJSON();
    const filename = `litemail_backup_${new Date().toISOString().split('T')[0]}.json`;
    this.downloadFile(filename, jsonStr, 'application/json');
    this.showToast('Backup JSON exported successfully', 'success');
  }

  handleImportBackup(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const ok = this.storage.importBackupJSON(event.target.result);
      if (ok) {
        this.renderAll();
        this.showToast('Backup imported successfully!', 'success');
      } else {
        this.showToast('Error importing backup: Invalid file format', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  handleResetDemo() {
    if (confirm('Reset all mail and telemetry to the default remote station demo dataset?')) {
      this.storage.resetToDemo();
      this.renderAll();
      this.showToast('Reset to demo dataset complete', 'info');
      this.closeSettings();
    }
  }

  // --- Utilities ---

  downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  formatDate(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    const now = new Date();
    
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  escapeHtml(text) {
    if (!text) return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✓';
    if (type === 'warning') icon = '⚠️';
    if (type === 'error') icon = '✕';

    toast.innerHTML = `<span>${icon}</span> <span>${this.escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }
}

// Instantiate on DOM load
window.addEventListener('DOMContentLoaded', () => {
  window.app = new LiteMailApp();
});
