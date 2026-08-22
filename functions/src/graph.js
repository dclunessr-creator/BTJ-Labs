/**
 * Shared Microsoft Graph helpers (app-only / client-credentials).
 *
 * Required application permissions on the app registration behind MS_CLIENT_ID,
 * each with admin consent granted in the Curucaye tenant:
 *   - Calendars.Read   — availability lookup (matthewInboundWebhook)
 *   - Mail.Send        — call notifications (matthewCallEvents)
 * Mail.Send is the one added for the notification webhook; without it sendMail
 * returns 403 and the caller degrades to logging only.
 */

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const HOST_UPN = 'dclunessr@curucaye.com';
const HOST_TZ = 'America/New_York';

// Token cache, refreshed ~60s before expiry. Module scope, so it survives
// across invocations on a warm instance.
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

/** Send mail as David. Throws on failure; callers decide whether that's fatal. */
async function sendMailAsHost({ to, subject, html }) {
  const token = await graphToken();
  const res = await fetch(`${GRAPH_BASE}/users/${encodeURIComponent(HOST_UPN)}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: 'HTML', content: html },
        toRecipients: (Array.isArray(to) ? to : [to]).map((address) => ({
          emailAddress: { address },
        })),
      },
      saveToSentItems: true,
    }),
  });
  if (!res.ok) throw new Error(`sendMail ${res.status}: ${await res.text()}`);
}

module.exports = { GRAPH_BASE, HOST_UPN, HOST_TZ, graphToken, sendMailAsHost };
