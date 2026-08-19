#!/usr/bin/env node
/**
 * Fetch one Retell call's outcome for cadence post-call processing.
 * Usage: RETELL_API_KEY=... node scripts/get-call.mjs <call_id>
 * Prints status, duration, disconnection reason, recording url, analysis, transcript.
 */
const KEY = process.env.RETELL_API_KEY;
if (!KEY) throw new Error('RETELL_API_KEY not set');
const callId = process.argv[2];
if (!callId) throw new Error('usage: node scripts/get-call.mjs <call_id>');

const res = await fetch(`https://api.retellai.com/v2/get-call/${callId}`, {
  headers: { Authorization: `Bearer ${KEY}` },
});
if (!res.ok) throw new Error(`get-call -> ${res.status}: ${await res.text()}`);
const c = await res.json();
const dur = c.end_timestamp && c.start_timestamp ? Math.round((c.end_timestamp - c.start_timestamp) / 1000) : null;
console.log(`CALL_ID=${c.call_id}`);
console.log(`STATUS=${c.call_status}`);
console.log(`DURATION_S=${dur ?? 'unknown'}`);
console.log(`DISCONNECTION=${c.disconnection_reason || ''}`);
console.log(`RECORDING=${c.recording_url || ''}`);
console.log(`ANALYSIS=${JSON.stringify(c.call_analysis || {})}`);
console.log('--- TRANSCRIPT ---');
console.log(c.transcript || '(no transcript)');
