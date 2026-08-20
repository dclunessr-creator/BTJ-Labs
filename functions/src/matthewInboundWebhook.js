/**
 * matthewInboundWebhook — Retell inbound handler for +13024965965.
 *
 * Retell request:  POST { event: "call_inbound",
 *                         call_inbound: { from_number, to_number, agent_id? } }
 * Response:        200  { call_inbound: { override_agent_id,
 *                                         dynamic_variables, metadata } }
 *
 * Per call, computed LIVE (no caches):
 *  - Caller lookup: HubSpot contact search by last-10-digit phone variants.
 *  - Availability: David's Outlook calendar via app-only Graph, next 10
 *    business days, 10:00–17:00 ET, 30-min slots. Busy rule matches the
 *    cadence skill: an event blocks time when it is marked busy/tentative/oof
 *    OR has any attendee besides David — regardless of show-as. Solo events
 *    marked free (task blocks) don't block.
 *
 * Failure posture: this webhook must NEVER fail the call. Any lookup error
 * degrades to empty variables — the agent prompt has a no-availability
 * fallback (take preferences, promise the emailed invite).
 */

// Filled from INBOUND.md after `scripts/provision-matthew.mjs` runs.
const MATTHEW_INBOUND_AGENT_ID = 'agent_fadfc0fa9bf090edba6ea7e64a';

const HOST_UPN = 'dclunessr@curucaye.com';
const HOST_TZ = 'America/New_York';
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const HS_BASE = 'https://api.hubapi.com';

// --- Graph app-only token (client credentials), cached to ~60s before expiry
let _tok = null;
let _exp = 0;
async function graphToken() {
  if (_tok && Date.now() < _exp - 60_000) return _tok;
  const body = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID,
    client_secret: process.env.MS_CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });
  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.MS_TENANT_ID}/oauth2/v2.0/token`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }
  );
  if (!res.ok) throw new Error(`graph token ${res.status}: ${await res.text()}`);
  const j = await res.json();
  _tok = j.access_token;
  _exp = Date.now() + (j.expires_in || 3600) * 1000;
  return _tok;
}

// --- ET wall-clock helpers (no external tz libs) ------------------------
function etParts(date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: HOST_TZ, year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', hour12: false, weekday: 'short',
  });
  const p = {};
  for (const { type, value } of fmt.formatToParts(date)) p[type] = value;
  return {
    y: +p.year, m: +p.month, d: +p.day,
    hour: p.hour === '24' ? 0 : +p.hour, minute: +p.minute, weekday: p.weekday,
  };
}
// Minutes since ET midnight for an instant.
function etMinutes(date) {
  const p = etParts(date);
  return p.hour * 60 + p.minute;
}
function etDateKey(date) {
  const p = etParts(date);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

/** Compute the availability string for the next 10 business days. */
async function computeAvailability() {
  const token = await graphToken();
  const now = new Date();
  const end = new Date(now.getTime() + 16 * 24 * 3600 * 1000); // covers 10 business days
  const url =
    `${GRAPH_BASE}/users/${encodeURIComponent(HOST_UPN)}/calendarView` +
    `?startDateTime=${now.toISOString()}&endDateTime=${end.toISOString()}` +
    `&$select=subject,start,end,showAs,attendees,isAllDay,isCancelled&$top=200`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="UTC"' },
  });
  if (!res.ok) throw new Error(`calendarView ${res.status}: ${await res.text()}`);
  const events = (await res.json()).value || [];

  // Busy intervals per the cadence rule.
  const busy = [];
  for (const ev of events) {
    if (ev.isCancelled || ev.isAllDay) continue;
    const others = (ev.attendees || []).filter(
      (a) => (a.emailAddress?.address || '').toLowerCase() !== HOST_UPN
    );
    const marked = ['busy', 'tentative', 'oof', 'workingelsewhere'].includes(
      String(ev.showAs || '').toLowerCase()
    );
    if (!marked && others.length === 0) continue; // solo free task block
    busy.push([
      new Date(ev.start.dateTime + 'Z').getTime(),
      new Date(ev.end.dateTime + 'Z').getTime(),
    ]);
  }

  // Walk forward day by day (ET), collecting open ranges 10:00–17:00.
  const dayLabels = [];
  let cursor = new Date(now);
  let businessDays = 0;
  const seenDays = new Set();
  while (businessDays < 10) {
    const p = etParts(cursor);
    const key = etDateKey(cursor);
    if (!seenDays.has(key)) {
      seenDays.add(key);
      const isWeekday = !['Sat', 'Sun'].includes(p.weekday);
      if (isWeekday) {
        businessDays++;
        // Build 30-min slots 10:00–17:00 ET for this ET day, skipping the past.
        const slots = [];
        for (let mins = 600; mins < 1020; mins += 30) {
          // Find the UTC instant for this ET wall-clock slot by scanning from
          // the cursor's midnight: approximate via date arithmetic in UTC and
          // correct with etMinutes.
          const approx = new Date(cursor);
          approx.setUTCHours(0, 0, 0, 0);
          // Try a window of UTC hours to land on the ET wall-clock minute.
          let slotStart = null;
          for (let h = 0; h < 48; h++) {
            const t = new Date(approx.getTime() + h * 1800_000);
            if (etDateKey(t) === key && etMinutes(t) === mins) { slotStart = t; break; }
          }
          if (!slotStart) continue;
          const s = slotStart.getTime(), e = s + 1800_000;
          if (s < now.getTime() + 30 * 60_000) continue; // skip past/imminent
          const blocked = busy.some(([bs, be]) => s < be && e > bs);
          if (!blocked) slots.push(mins);
        }
        if (slots.length) {
          // Merge consecutive slots into ranges.
          const ranges = [];
          let rs = slots[0], prev = slots[0];
          for (const m of slots.slice(1)) {
            if (m === prev + 30) { prev = m; continue; }
            ranges.push([rs, prev + 30]); rs = m; prev = m;
          }
          ranges.push([rs, prev + 30]);
          const fmtM = (m) => {
            const h = Math.floor(m / 60), mm = m % 60;
            const h12 = ((h + 11) % 12) + 1;
            return `${h12}${mm ? ':' + String(mm).padStart(2, '0') : ''}${h < 12 ? 'am' : 'pm'}`;
          };
          dayLabels.push(
            `${p.weekday} ${p.m}/${p.d}: ${ranges.map(([a, b]) => `${fmtM(a)}-${fmtM(b)}`).join(', ')}`
          );
        }
      }
    }
    cursor = new Date(cursor.getTime() + 6 * 3600 * 1000);
  }
  return dayLabels.join('; ') + (dayLabels.length ? ' (all Eastern)' : '');
}

// --- HubSpot caller lookup ----------------------------------------------
function phoneVariants(raw) {
  const d10 = String(raw || '').replace(/\D/g, '').slice(-10);
  if (d10.length !== 10) return [];
  const a = d10.slice(0, 3), b = d10.slice(3, 6), c = d10.slice(6);
  return [d10, `1${d10}`, `+1${d10}`, `(${a}) ${b}-${c}`, `${a}-${b}-${c}`, `${a}.${b}.${c}`];
}
async function findContactByPhone(fromNumber) {
  const variants = phoneVariants(fromNumber);
  if (!variants.length) return null;
  const res = await fetch(`${HS_BASE}/crm/v3/objects/contacts/search`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.HUBSPOT_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filterGroups: [
        { filters: [{ propertyName: 'phone', operator: 'IN', values: variants }] },
        { filters: [{ propertyName: 'mobilephone', operator: 'IN', values: variants }] },
      ],
      properties: ['firstname', 'lastname', 'original_source_desc', 'hs_lead_status'],
      limit: 1,
    }),
  });
  if (!res.ok) throw new Error(`hubspot search ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return j.results?.[0] || null;
}

// --- Handler --------------------------------------------------------------
async function handleMatthewInbound(req, res) {
  if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return; }
  const inbound = req.body?.call_inbound || {};
  const fromNumber = inbound.from_number || '';
  console.log(`[matthewInbound] call from ${fromNumber}`);

  let contact = null;
  let availability = '';
  const [cRes, aRes] = await Promise.allSettled([
    findContactByPhone(fromNumber),
    computeAvailability(),
  ]);
  if (cRes.status === 'fulfilled') contact = cRes.value;
  else console.error('[matthewInbound] contact lookup failed:', cRes.reason?.message);
  if (aRes.status === 'fulfilled') availability = aRes.value;
  else console.error('[matthewInbound] availability failed:', aRes.reason?.message);

  const firstName = contact?.properties?.firstname || '';
  const nowStr = new Date().toLocaleString('en-US', {
    timeZone: HOST_TZ, weekday: 'long', month: 'long', day: 'numeric',
    year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  });

  res.status(200).json({
    call_inbound: {
      override_agent_id: MATTHEW_INBOUND_AGENT_ID,
      dynamic_variables: {
        first_name: String(firstName),
        known_lead: String(!!contact),
        availability: String(availability),
        current_date: String(nowStr),
        timezone: 'America/New_York (Eastern)',
        callback_number: '+1 302-496-5965',
      },
      metadata: {
        crm_contact_id: String(contact?.id || ''),
        source: 'btj-inbound',
      },
    },
  });
}

module.exports = { handleMatthewInbound };
