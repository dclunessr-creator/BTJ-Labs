/**
 * BTJ Labs functions codebase ("btj") — deployed into the existing
 * website-redesign-sales-agent Firebase project so it shares that project's
 * secrets (MS_* Graph app credentials, HUBSPOT_API_KEY). Source of truth
 * lives in the BTJ-Labs repo; deploy touches ONLY this codebase:
 *
 *   cd functions && npm install
 *   npx firebase-tools deploy --only functions:btj --project website-redesign-sales-agent
 */

const { onRequest } = require('firebase-functions/v2/https');
const { handleMatthewInbound } = require('./src/matthewInboundWebhook');
const { handleMatthewCallEvents } = require('./src/matthewCallEvents');

/**
 * matthewInboundWebhook
 * Answers inbound calls to Matthew's number (+13024965965). Looks the caller
 * up in HubSpot by phone, computes David's LIVE availability from Microsoft
 * Graph, and returns the inbound agent + dynamic variables so Matthew can
 * schedule on the call exactly like outbound.
 * One-time setup: set this function's URL as inbound_webhook_url on the
 * Retell phone number (scripts/bind-inbound-webhook.mjs).
 */
exports.matthewInboundWebhook = onRequest(
  {
    timeoutSeconds: 15,
    secrets: ['HUBSPOT_API_KEY', 'MS_TENANT_ID', 'MS_CLIENT_ID', 'MS_CLIENT_SECRET'],
  },
  handleMatthewInbound
);

/**
 * matthewCallEvents
 * Retell agent-level webhook: fires when a call finishes. Logs the outcome to
 * the lead's HubSpot record and emails David a callback alert (inbound) or a
 * call report (outbound), with recording and transcript.
 *
 * This is what makes the pipeline push instead of poll — no scheduled session
 * has to go hunting for callbacks or call outcomes.
 *
 * One-time setup: set this function's URL — WITH its ?token=... — as the
 * `webhook_url` on both Matthew agents (scripts/provision-matthew.mjs reads it
 * from MATTHEW_EVENTS_WEBHOOK_URL).
 */
exports.matthewCallEvents = onRequest(
  {
    timeoutSeconds: 60,
    secrets: [
      'BTJ_WEBHOOK_TOKEN',
      'HUBSPOT_API_KEY',
      'MS_TENANT_ID',
      'MS_CLIENT_ID',
      'MS_CLIENT_SECRET',
    ],
  },
  handleMatthewCallEvents
);
