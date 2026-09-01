# LiteMail ✉️
### Ultra-Lightweight, Text-Only Email Client for Remote Areas with Real Gmail & Outlook API Support

LiteMail is an ultra-minimalist email client engineered for **field operations, remote research stations, maritime vessels, humanitarian missions, and areas with intermittent or metered 2G / satellite / dial-up connectivity**.

It now features **full native integration with real Google Gmail and Microsoft Outlook accounts** alongside its offline outbox and sneakernet capabilities.

---

## ⚡ Key Highlights & Low-Bandwidth Architecture

1. **Zero Bloat & Plain-Text Focus:**
   - Strips all heavy HTML markup, tracking scripts, web fonts, and remote tracking pixels.
   - Core fields supported: `To`, `Cc`, `Bcc`, `Subject`, and `Body`.
   - Ultra-small payload sizes (~100–500 Bytes per email instead of multi-megabyte HTML emails).

2. **Real Gmail & Outlook API Connectivity:**
   - **Google Gmail API:** Send and receive real text emails via Google's official REST API (`gmail.googleapis.com`).
   - **Microsoft Outlook / 365:** Send and receive real text emails via Microsoft Graph API (`graph.microsoft.com`).
   - **Custom Webhook / REST Relay:** Route through custom microservices or services like Resend or SendGrid.

3. **Offline-First & Resilient Outbox Queue:**
   - Compose anytime, even with zero network connectivity.
   - Outgoing messages are stored in a persistent local **Outbox** queue.
   - Automatically attempts transmission whenever connection pulses back online, or manually with one-click **Sync Now**.

4. **Live Payload & Byte Counter:**
   - Real-time UTF-8 byte counter as you type.
   - Estimates transmission time over 2G (9.6 kbps) and satellite (2.4 kbps) links.
   - Session data telemetry tracking total bytes sent and received.

5. **Sneakernet & Physical Transport Support:**
   - Export individual emails as raw `.txt` or `.eml` files.
   - Export and import full mailbox JSON archives for physical transfer via USB flash drives between remote outpost camps and base headquarters.

---

## 🔑 How to Connect Real Accounts (Step-by-Step)

Open **LiteMail Settings (⚙)** and select your active provider:

### Option A: Google Gmail API
1. Open Google's official OAuth Playground or your Google Cloud Console:
   - Quick testing: Visit [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground/).
   - Select the scopes: `https://www.googleapis.com/auth/gmail.send` and `https://www.googleapis.com/auth/gmail.readonly`.
   - Click **Authorize APIs** and exchange authorization code for tokens.
2. Copy the **Access Token** (`ya29.a0Af...`).
3. In LiteMail **Settings (⚙)**:
   - Set Active Provider to **Google Gmail**.
   - Paste your Access Token into the token field.
   - Click **⚡ Test & Sync Gmail Profile**.
   - Click **Save Changes**.
4. You are now connected! Composed emails will be sent directly from your real Gmail account, and clicking **↻ Sync Now** will fetch your newest Gmail text emails.

---

### Option B: Microsoft Outlook / Office 365 (Microsoft Graph API)
1. Quick testing: Visit [Microsoft Graph Explorer](https://developer.microsoft.com/en-us/graph/graph-explorer).
2. Sign in with your Microsoft / Outlook account.
3. Ensure permissions `Mail.Read` and `Mail.Send` are consented.
4. Copy the **Access Token** from the Access Token tab in Graph Explorer.
5. In LiteMail **Settings (⚙)**:
   - Set Active Provider to **Microsoft Outlook**.
   - Paste your Access Token into the token field.
   - Click **⚡ Test & Sync Outlook Profile**.
   - Click **Save Changes**.
6. You are now connected! Composed emails will be sent via Microsoft Graph with `"contentType": "Text"` (ensuring zero HTML bloat).

---

### Option C: Offline Simulation (Default)
- Runs completely offline without any account setup.
- Perfect for field simulation, isolated local testing, and sneakernet operations.

---

## 🚀 Getting Started

### Method 1: Double-Click Launcher (Instant)
- Simply double-click **`start-litemail.bat`** on your Desktop, or double-click **`index.html`** in any web browser.

### Method 2: Optional Local Server
- Right-click **`start-server.ps1`** and select **Run with PowerShell**.
- Opens automatically at `http://localhost:8080`.

---

## ⌨ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| **`C`** | Compose new text email |
| **`Ctrl + Enter`** | Send message from composer |
| **`/`** | Focus search bar |
| **`J` / `K`** | Navigate to Next / Previous email in list |
| **`R`** | Reply to selected email |
| **`A`** | Reply All |
| **`S`** | Star / Unstar email |
| **`D`** | Delete email / Move to Trash |
| **`Esc`** | Close modal / auto-save draft |
| **`?`** | Open keyboard shortcuts help modal |

---

## 📁 File Structure

```text
LiteMail/
├── index.html          # Lightweight Single Page Application UI
├── css/
│   └── style.css       # Zero-dependency, pure responsive CSS themes
├── js/
│   ├── demo-data.js    # Sample remote field station emails & alerts
│   ├── storage.js      # LocalStorage manager, drafts, backup/export
│   ├── providers.js    # Real Gmail REST API & Outlook Graph API adapters
│   ├── sync.js         # Offline detection, queue processor, bandwidth meter
│   └── app.js          # Main UI controller, keyboard shortcuts, templates
├── start-litemail.bat  # 1-click Windows browser launcher
├── start-server.ps1    # Zero-dependency PowerShell local HTTP server
└── README.md           # Documentation and user manual
```
