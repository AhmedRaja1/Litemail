/**
 * LiteMail Real Email Provider Adapters
 * Supports:
 * 1. Google Gmail REST API
 * 2. Microsoft Outlook / Office 365 (Microsoft Graph API)
 * 3. Custom REST / Webhook Relay (e.g. Resend, SendGrid, Cloudflare Worker)
 * 4. Offline Simulation (Local Outbox Queue)
 */

class BaseProvider {
  constructor(config = {}) {
    this.config = config;
  }

  async testConnection() {
    throw new Error("Method not implemented");
  }

  async sendMail(message) {
    throw new Error("Method not implemented");
  }

  async fetchInbox(limit = 10) {
    throw new Error("Method not implemented");
  }
}

// --------------------------------------------------------------------------
// 1. Google Gmail Provider (Official Gmail REST API v1)
// --------------------------------------------------------------------------
class GmailProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this.accessToken = config.accessToken || '';
    this.clientId = config.clientId || '';
  }

  setToken(token) {
    this.accessToken = token;
  }

  getHeaders() {
    if (!this.accessToken) {
      throw new Error("Gmail Access Token missing. Please authorize in Settings.");
    }
    return {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json'
    };
  }

  async testConnection() {
    try {
      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: this.getHeaders()
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `HTTP ${res.status}: ${res.statusText}`);
      }
      const profile = await res.json();
      return {
        success: true,
        email: profile.emailAddress,
        messagesTotal: profile.messagesTotal
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // Create RFC 2822 plain text email and Base64URL encode it
  buildRawEmail(msg) {
    const lines = [];
    if (msg.from) lines.push(`From: ${msg.from}`);
    lines.push(`To: ${msg.to}`);
    if (msg.cc) lines.push(`Cc: ${msg.cc}`);
    if (msg.bcc) lines.push(`Bcc: ${msg.bcc}`);
    lines.push(`Subject: =?utf-8?B?${this.base64EncodeUnicode(msg.subject || '(No Subject)')}?=`);
    lines.push('MIME-Version: 1.0');
    lines.push('Content-Type: text/plain; charset=utf-8');
    lines.push('Content-Transfer-Encoding: 8bit');
    lines.push('');
    lines.push(msg.body || '');

    const rfcString = lines.join('\r\n');
    return this.base64UrlEncode(rfcString);
  }

  base64EncodeUnicode(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }

  base64UrlEncode(str) {
    const base64 = this.base64EncodeUnicode(str);
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  base64UrlDecode(str) {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    return decodeURIComponent(escape(atob(base64)));
  }

  async sendMail(msg) {
    try {
      const raw = this.buildRawEmail(msg);
      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ raw })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `Gmail API Error: HTTP ${res.status}`);
      }

      const data = await res.json();
      return { success: true, messageId: data.id, provider: 'gmail' };
    } catch (e) {
      return { success: false, error: e.message, provider: 'gmail' };
    }
  }

  async fetchInbox(limit = 10) {
    try {
      // Fetch message list
      const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${limit}&q=label:INBOX`, {
        headers: this.getHeaders()
      });

      if (!listRes.ok) {
        throw new Error(`Failed to list messages: HTTP ${listRes.status}`);
      }

      const listData = await listRes.json();
      if (!listData.messages || listData.messages.length === 0) {
        return { success: true, messages: [], bytesTransferred: 0 };
      }

      let totalBytes = 0;
      const parsedMessages = [];

      // Fetch each message and extract plain text
      for (const m of listData.messages) {
        const detailRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`, {
          headers: this.getHeaders()
        });

        if (detailRes.ok) {
          const detailData = await detailRes.json();
          totalBytes += (detailData.sizeEstimate || 500);

          const headers = detailData.payload?.headers || [];
          const getHeader = (name) => {
            const h = headers.find(x => x.name.toLowerCase() === name.toLowerCase());
            return h ? h.value : '';
          };

          const from = getHeader('From');
          const to = getHeader('To');
          const cc = getHeader('Cc');
          const subject = getHeader('Subject') || '(No Subject)';
          const date = getHeader('Date') ? new Date(getHeader('Date')).toISOString() : new Date().toISOString();

          // Extract plain-text body
          const bodyText = this.extractPlainText(detailData.payload);

          parsedMessages.push({
            id: 'gmail-' + detailData.id,
            folder: 'inbox',
            from,
            to,
            cc,
            bcc: '',
            subject,
            body: bodyText || detailData.snippet || '(No message content)',
            date,
            unread: detailData.labelIds?.includes('UNREAD') || false,
            sizeBytes: new Blob([subject + from + bodyText]).size,
            status: 'synced',
            starred: detailData.labelIds?.includes('STARRED') || false
          });
        }
      }

      return {
        success: true,
        messages: parsedMessages,
        bytesTransferred: totalBytes
      };
    } catch (e) {
      return { success: false, error: e.message, messages: [], bytesTransferred: 0 };
    }
  }

  extractPlainText(payload) {
    if (!payload) return '';

    if (payload.mimeType === 'text/plain' && payload.body?.data) {
      try {
        return this.base64UrlDecode(payload.body.data);
      } catch (e) {
        return '';
      }
    }

    if (payload.parts && Array.isArray(payload.parts)) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          try {
            return this.base64UrlDecode(part.body.data);
          } catch (e) {}
        }
        if (part.parts) {
          const nested = this.extractPlainText(part);
          if (nested) return nested;
        }
      }
      // If only html exists, strip tags
      for (const part of payload.parts) {
        if (part.mimeType === 'text/html' && part.body?.data) {
          try {
            const html = this.base64UrlDecode(part.body.data);
            return this.stripHtml(html);
          } catch (e) {}
        }
      }
    }

    if (payload.body?.data) {
      try {
        const decoded = this.base64UrlDecode(payload.body.data);
        return payload.mimeType === 'text/html' ? this.stripHtml(decoded) : decoded;
      } catch (e) {}
    }

    return '';
  }

  stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                        .replace(/<br\s*[\/]?>/gi, '\n')
                        .replace(/<\/p>/gi, '\n\n')
                        .replace(/<\/div>/gi, '\n');
    return tmp.textContent || tmp.innerText || '';
  }
}

// --------------------------------------------------------------------------
// 2. Microsoft Outlook / Microsoft Graph API Provider
// --------------------------------------------------------------------------
class OutlookProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this.accessToken = config.accessToken || '';
    this.clientId = config.clientId || '';
  }

  setToken(token) {
    this.accessToken = token;
  }

  getHeaders() {
    if (!this.accessToken) {
      throw new Error("Microsoft Outlook Access Token missing. Please authorize in Settings.");
    }
    return {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json'
    };
  }

  async testConnection() {
    try {
      const res = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: this.getHeaders()
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `HTTP ${res.status}: ${res.statusText}`);
      }
      const user = await res.json();
      return {
        success: true,
        name: user.displayName,
        email: user.mail || user.userPrincipalName
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  parseEmailAddresses(str) {
    if (!str) return [];
    return str.split(/[,;]/).map(s => s.trim()).filter(s => s.length > 0).map(email => ({
      emailAddress: { address: email }
    }));
  }

  async sendMail(msg) {
    try {
      const toRecipients = this.parseEmailAddresses(msg.to);
      const ccRecipients = this.parseEmailAddresses(msg.cc);
      const bccRecipients = this.parseEmailAddresses(msg.bcc);

      if (toRecipients.length === 0) {
        throw new Error("Invalid recipient address for Outlook send.");
      }

      // Microsoft Graph API strictly supports pure text with "contentType": "Text"
      const payload = {
        message: {
          subject: msg.subject || '(No Subject)',
          body: {
            contentType: 'Text',
            content: msg.body || ''
          },
          toRecipients: toRecipients,
          ccRecipients: ccRecipients,
          bccRecipients: bccRecipients
        },
        saveToSentItems: 'true'
      };

      const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload)
      });

      // 202 Accepted is standard for Graph sendMail
      if (res.status !== 202 && !res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `Outlook Graph Error: HTTP ${res.status}`);
      }

      return { success: true, provider: 'outlook' };
    } catch (e) {
      return { success: false, error: e.message, provider: 'outlook' };
    }
  }

  async fetchInbox(limit = 10) {
    try {
      const selectFields = 'id,subject,from,toRecipients,ccRecipients,receivedDateTime,isRead,bodyPreview,body';
      const url = `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=${limit}&$select=${selectFields}&$orderby=receivedDateTime desc`;

      const res = await fetch(url, { headers: this.getHeaders() });
      if (!res.ok) {
        throw new Error(`Failed to fetch Outlook messages: HTTP ${res.status}`);
      }

      const data = await res.json();
      const items = data.value || [];
      let totalBytes = 0;

      const messages = items.map(item => {
        let bodyText = item.body?.content || item.bodyPreview || '';
        if (item.body?.contentType === 'html') {
          bodyText = this.stripHtml(bodyText);
        }

        const from = item.from?.emailAddress?.address || item.from?.emailAddress?.name || 'Unknown';
        const to = (item.toRecipients || []).map(r => r.emailAddress?.address).join(', ');
        const cc = (item.ccRecipients || []).map(r => r.emailAddress?.address).join(', ');
        const subject = item.subject || '(No Subject)';
        const date = item.receivedDateTime || new Date().toISOString();
        const sizeBytes = new Blob([subject + from + bodyText]).size;

        totalBytes += sizeBytes;

        return {
          id: 'outlook-' + item.id,
          folder: 'inbox',
          from,
          to,
          cc,
          bcc: '',
          subject,
          body: bodyText,
          date,
          unread: !item.isRead,
          sizeBytes,
          status: 'synced',
          starred: false
        };
      });

      return {
        success: true,
        messages,
        bytesTransferred: totalBytes
      };
    } catch (e) {
      return { success: false, error: e.message, messages: [], bytesTransferred: 0 };
    }
  }

  stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                        .replace(/<br\s*[\/]?>/gi, '\n')
                        .replace(/<\/p>/gi, '\n\n')
                        .replace(/<\/div>/gi, '\n');
    return tmp.textContent || tmp.innerText || '';
  }
}

// --------------------------------------------------------------------------
// 3. Custom REST Relay Provider (SendGrid / Resend / Webhook)
// --------------------------------------------------------------------------
class CustomRelayProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this.url = config.url || '';
    this.apiKey = config.apiKey || '';
  }

  async testConnection() {
    if (!this.url) return { success: false, error: 'Relay URL is empty' };
    return { success: true, url: this.url };
  }

  async sendMail(msg) {
    if (!this.url) {
      return { success: false, error: 'Custom Relay URL not configured.' };
    }

    try {
      const headers = {
        'Content-Type': 'application/json',
        'X-LiteMail-Version': '1.0'
      };
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const res = await fetch(this.url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          from: msg.from,
          to: msg.to,
          cc: msg.cc,
          bcc: msg.bcc,
          subject: msg.subject,
          body: msg.body,
          timestamp: msg.date,
          sizeBytes: msg.sizeBytes
        })
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      return { success: true, provider: 'relay' };
    } catch (e) {
      return { success: false, error: e.message, provider: 'relay' };
    }
  }

  async fetchInbox() {
    return { success: true, messages: [], bytesTransferred: 0 };
  }
}

// --------------------------------------------------------------------------
// 4. Offline Simulation Provider (Field Local Outbox)
// --------------------------------------------------------------------------
class SimulationProvider extends BaseProvider {
  async testConnection() {
    return { success: true, mode: 'simulation' };
  }

  async sendMail(msg) {
    await new Promise(r => setTimeout(r, 200));
    return { success: true, provider: 'simulation' };
  }

  async fetchInbox() {
    return { success: true, messages: [], bytesTransferred: 0 };
  }
}

// --------------------------------------------------------------------------
// Provider Factory & Manager
// --------------------------------------------------------------------------
class ProviderManager {
  static getProvider(settings) {
    const mode = settings.providerMode || settings.gatewayMode || 'simulation';
    
    switch (mode) {
      case 'gmail':
        return new GmailProvider({
          accessToken: settings.gmailAccessToken || '',
          clientId: settings.gmailClientId || ''
        });
      case 'outlook':
        return new OutlookProvider({
          accessToken: settings.outlookAccessToken || '',
          clientId: settings.outlookClientId || ''
        });
      case 'relay':
      case 'webhook':
        return new CustomRelayProvider({
          url: settings.gatewayUrl || '',
          apiKey: settings.gatewayApiKey || ''
        });
      case 'simulation':
      default:
        return new SimulationProvider();
    }
  }
}

window.GmailProvider = GmailProvider;
window.OutlookProvider = OutlookProvider;
window.CustomRelayProvider = CustomRelayProvider;
window.SimulationProvider = SimulationProvider;
window.ProviderManager = ProviderManager;
