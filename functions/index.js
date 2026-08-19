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
