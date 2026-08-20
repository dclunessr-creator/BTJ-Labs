#!/usr/bin/env node
/**
 * Point Matthew's number at the deployed inbound webhook.
 * Usage: RETELL_API_KEY=... node scripts/bind-inbound-webhook.mjs <webhook-url>
 * Replaces any direct inbound agent binding on +13024965965.
 */
const KEY = process.env.RETELL_API_KEY;
if (!KEY) throw new Error('RETELL_API_KEY not set');
const url = process.argv[2];
if (!url || !url.startsWith('https://')) {
  throw new Error('usage: node scripts/bind-inbound-webhook.mjs <https webhook url>');
}

const res = await fetch('https://api.retellai.com/update-phone-number/+13024965965', {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ inbound_webhook_url: url }),
});
const text = await res.text();
if (!res.ok) throw new Error(`update-phone-number -> ${res.status}: ${text}`);
console.log('INBOUND_WEBHOOK_BOUND=' + url);
