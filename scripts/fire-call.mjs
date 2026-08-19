#!/usr/bin/env node
/**
 * Fire one outbound Retell call for the BTJ cadence (or a test).
 * Usage: RETELL_API_KEY=... node scripts/fire-call.mjs calls/<payload>.json
 * The payload file holds the full create-phone-call body. Prints the call_id.
 * Used by the daily cadence helpers — keep argument handling stable.
 */
import { readFileSync } from 'node:fs';

const KEY = process.env.RETELL_API_KEY;
if (!KEY) throw new Error('RETELL_API_KEY not set');
const payloadPath = process.argv[2];
if (!payloadPath) throw new Error('usage: node scripts/fire-call.mjs <payload.json>');

const payload = JSON.parse(readFileSync(payloadPath, 'utf8'));
for (const k of ['from_number', 'to_number', 'override_agent_id']) {
  if (!payload[k]) throw new Error(`payload missing ${k}`);
}
// Retell requires every dynamic variable to be a string.
const vars = payload.retell_llm_dynamic_variables || {};
for (const [k, v] of Object.entries(vars)) vars[k] = String(v);

const res = await fetch('https://api.retellai.com/v2/create-phone-call', {
  method: 'POST',
  headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});
const text = await res.text();
if (!res.ok) throw new Error(`create-phone-call -> ${res.status}: ${text}`);
const data = text ? JSON.parse(text) : {};
console.log(`CALL_ID=${data.call_id || 'unknown'}`);
