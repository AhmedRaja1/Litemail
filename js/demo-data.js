// LiteMail Demo Data - Tailored for Remote Field Stations & Low-Bandwidth Operations
const DEMO_MESSAGES = [
  {
    id: "msg-101",
    folder: "inbox",
    from: "dr.sarah.chen@arctic-expedition.org",
    to: "field-team@remotestation.org",
    cc: "hq-ops@arctic-expedition.org",
    bcc: "",
    subject: "Weather Alert: Blizzard inbound sector 4 (Next 18 hrs)",
    body: `FIELD TEAM SITREP:

Satellite telemetry indicates high-velocity front moving SE at 45 knots.
Expected onset: 21:00 UTC. 
Temperatures dropping to -38C with whiteout conditions.

ACTION ITEMS:
1. Secure all solar arrays and external sensor masts.
2. Switch radio beacon to 4-hour ping cycle to conserve diesel generator fuel.
3. Transmit final meteorological readings before 20:00 UTC.

Next scheduled satellite uplink: Tomorrow 06:30 UTC.

-- 
Dr. Sarah Chen
Lead Meteorologist, Sector 4 Station`,
    date: new Date(Date.now() - 1000 * 60 * 45).toISOString(), // 45 min ago
    unread: true,
    sizeBytes: 524,
    status: "synced",
    starred: true
  },
  {
    id: "msg-102",
    folder: "inbox",
    from: "logistics@global-aid-network.org",
    to: "field-team@remotestation.org",
    cc: "transport-hub@global-aid-network.org",
    bcc: "",
    subject: "Supply Drop Confirmation #882 - Medical & Fuel",
    body: `Supply flight C-130 scheduled for waypoint Bravo-7.

Manifest:
- 200L Winterized Diesel
- 4x Emergency Medical Trauma Kits (Type B)
- 2x Satellite Battery Replacement Units
- Rations for 14 days (4 personnel)

Coordinates: 68.324 N, 133.521 W
Estimated Drop Window: Sept 3, 14:00 - 15:30 UTC

Acknowledge receipt via plain-text reply only. Do not send attachments.

Logistics Coordination Desk`,
    date: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(), // 4 hours ago
    unread: true,
    sizeBytes: 432,
    status: "synced",
    starred: false
  },
  {
    id: "msg-103",
    folder: "inbox",
    from: "systems-admin@remotestation.org",
    to: "all-stations@remotestation.org",
    cc: "",
    bcc: "",
    subject: "Low-Bandwidth Protocol Notice (Bandwidth Cap Active)",
    body: `ALL STATIONS REMINDER:

Due to transponder degradation on SatLink-3, all satellite traffic is restricted to plain-text messages under 2 KB.

HTML formatting, images, and heavy file attachments are blocked at the base gateway. 
Use LiteMail for all essential communication.

Bandwidth quota remaining for Sector: 4.2 MB for this billing cycle.
Keep messages concise and use standard abbreviation formats where possible.`,
    date: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(), // Yesterday
    unread: false,
    sizeBytes: 468,
    status: "synced",
    starred: false
  },
  {
    id: "msg-104",
    folder: "sent",
    from: "operator@remotestation.org",
    to: "hq-ops@arctic-expedition.org",
    cc: "dr.sarah.chen@arctic-expedition.org",
    bcc: "",
    subject: "Station Echo: Daily SitRep 2026-08-31",
    body: `DAILY SITUATION REPORT - STATION ECHO
Date: 2026-08-31
Personnel: 4/4 Healthy

STATUS:
- Solar Array: 85% Efficiency (Minor frost accumulation cleared)
- Generator Fuel: 640 Liters remaining (approx 22 days at current load)
- Water Recycler: Operational, normal pressure
- Core Ice Samples: 12 units collected and archived at -20C

WEATHER:
- Wind: 18 kts NNW
- Temp: -24C
- Barometer: 1012 hPa (Falling)

No emergencies to report. Next update in 24h.`,
    date: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString(),
    unread: false,
    sizeBytes: 489,
    status: "synced",
    starred: false
  },
  {
    id: "msg-105",
    folder: "outbox",
    from: "operator@remotestation.org",
    to: "supply-coordination@remotestation.org",
    cc: "station-lead@remotestation.org",
    bcc: "",
    subject: "Urgent: Water pump gasket spare part request",
    body: `Station Echo primary water pump seal showing minor leakage.
Pump functioning on secondary gasket. Requesting replacement seal kit (Part #WP-441-A) in next supply drop.

Urgency: Moderate (redundancy compromised, but operating).`,
    date: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    unread: false,
    sizeBytes: 254,
    status: "queued",
    retryCount: 1,
    lastAttempt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    starred: false
  }
];
