#!/usr/bin/env node
/**
 * List recent calls on Matthew's number (+13024965965), newest first.
 * Read-only; safe to re-run.
 *
 * Usage: RETELL_API_KEY=... node scripts/list-calls.mjs [--since <ISO timestamp>] [--limit <n>]
 *   --since  only calls starting at/after this time (default: last 24h)
 *   --limit  max calls to print (default 50)
 *
 * Prints one line per call:
 *   CALL <call_id> <direction> from=<from> to=<to> start=<ISO> status=<status> disconnect=<reason> dur_s=<n>
 */
const KEY = process.env.RETELL_API_KEY;
if (!KEY) throw new Error('RETELL_API_KEY not set');

const NUMBER = '+13024965965';
const args = process.argv.slice(2);
function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}
const sinceArg = argValue('--since');
const since = sinceArg ? Date.parse(sinceArg) : Date.now() - 24 * 3600 * 1000;
if (Number.isNaN(since)) throw new Error(`bad --since value: ${sinceArg}`);
const limit = Number(argValue('--limit') || 50);

const res = await fetch('https://api.retellai.com/v2/list-calls', {
  method: 'POST',
  headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    filter_criteria: {
      start_timestamp: { lower_threshold: since },
    },
    sort_order: 'descending',
    limit,
  }),
});
const text = await res.text();
if (!res.ok) throw new Error(`list-calls -> ${res.status}: ${text}`);
const calls = JSON.parse(text);

let printed = 0;
for (const c of Array.isArray(calls) ? calls : calls.calls || []) {
  const from = c.from_number || '';
  const to = c.to_number || '';
  if (from !== NUMBER && to !== NUMBER) continue; // only Matthew's line
  const start = c.start_timestamp ? new Date(c.start_timestamp).toISOString() : '?';
  const durS = c.duration_ms
    ? Math.round(c.duration_ms / 1000)
    : c.end_timestamp && c.start_timestamp
      ? Math.round((c.end_timestamp - c.start_timestamp) / 1000)
      : '';
  console.log(
    `CALL ${c.call_id} ${c.direction || '?'} from=${from} to=${to} start=${start} ` +
      `status=${c.call_status || '?'} disconnect=${c.disconnection_reason || ''} dur_s=${durS}`
  );
  printed++;
}
console.log(`TOTAL=${printed}`);
