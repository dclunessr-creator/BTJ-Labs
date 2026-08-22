/**
 * matthewCallEvents — Retell AGENT-level webhook for Matthew's calls.
 *
 * This is what removes the polling. Retell POSTs here when a call finishes, so
 * callbacks and call outcomes reach HubSpot and David's inbox on their own; no
 * scheduled session has to go looking for them.
 *
 * Retell request:  POST ?token=<secret>  { event, call }
 *   event: call_started | call_ended | call_analyzed
 * We act on call_analyzed only — it is the one carrying transcript + analysis.
 * Everything else gets a 200 and is ignored.
 *
 * Wiring (different from the inbound webhook, which is bound to the PHONE
 * NUMBER and only ever receives call_inbound): this URL goes in the `webhook_url`
 * field of BOTH Matthew agents — see scripts/provision-matthew.mjs.
 *
 * Auth: the URL carries ?token=<BTJ_WEBHOOK_TOKEN>. The endpoint writes to the
 * CRM and sends mail, so an unauthenticated request is refused.
 */

const crypto = require('crypto');
const { sendMailAsHost, HOST_UPN, HOST_TZ } = require('./graph');
const { findContactByPhone, createNoteOnContact, markAttempted } = require('./hubspot');

const MATTHEW_NUMBER = '+13024965965';

// Suppress Retell delivery retries for the same call on a warm instance.
const seenCallIds = new Set();

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a || ''));
  const bufB = Buffer.from(String(b || ''));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function etStamp(ms) {
  if (!ms) return 'unknown time';
  return new Date(ms).toLocaleString('en-US', {
    timeZone: HOST_TZ, weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  });
}

/**
 * Cheap signal extraction. These are HINTS for David, never decisions — the
 * full transcript rides along in the email so he can judge for himself.
 */
function readSignals(transcript, analysis) {
  const t = String(transcript || '').toLowerCase();
  const optOut = /(do not call|don'?t call|stop calling|remove me|take me off|unsubscribe)/.test(t);
  const hasTime = /\b\d{1,2}(:\d{2})?\s?(a\.?m\.?|p\.?m\.?)\b/.test(t) ||
    /\b(monday|tuesday|wednesday|thursday|friday|tomorrow|next week)\b/.test(t);
  const agreed = /(sounds good|that works|works for me|let'?s do|see you then|book me|put me down|calendar invite)/.test(t);
  return {
    optOut,
    possibleBooking: !analysis?.in_voicemail && hasTime && agreed,
    voicemail: !!analysis?.in_voicemail,
    sentiment: analysis?.user_sentiment || '',
    summary: analysis?.call_summary || '',
  };
}

function transcriptHtml(transcript) {
  const lines = String(transcript || '').split('\n').filter((l) => l.trim());
  if (!lines.length) return '<p><i>No transcript captured.</i></p>';
  return `<pre>${esc(lines.join('\n'))}</pre>`;
}

async function handleMatthewCallEvents(req, res) {
  if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return; }

  const expected = process.env.BTJ_WEBHOOK_TOKEN;
  if (!expected || !timingSafeEqual(req.query?.token, expected)) {
    console.warn('[callEvents] rejected: bad or missing token');
    res.status(403).send('Forbidden');
    return;
  }

  const event = req.body?.event;
  const call = req.body?.call || {};

  // Ack anything we don't act on, so Retell stops retrying it.
  if (event !== 'call_analyzed') { res.status(200).json({ ok: true, ignored: event }); return; }
  if (call.from_number !== MATTHEW_NUMBER && call.to_number !== MATTHEW_NUMBER) {
    res.status(200).json({ ok: true, ignored: 'other number' });
    return;
  }
  if (call.call_id && seenCallIds.has(call.call_id)) {
    res.status(200).json({ ok: true, ignored: 'duplicate delivery' });
    return;
  }
  if (call.call_id) seenCallIds.add(call.call_id);

  // Finish the work BEFORE responding. Cloud Run may freeze the instance the
  // moment the response is sent, so anything deferred past this point risks
  // being dropped silently. processCall swallows its own errors, so a failed
  // note or email still returns 200 and Retell does not redeliver.
  try {
    await processCall(call);
  } catch (err) {
    console.error('[callEvents] processing failed:', err?.message, 'call', call.call_id);
  }
  res.status(200).json({ ok: true });
}

async function processCall(call) {
  const inbound = call.direction === 'inbound';
  const leadNumber = inbound ? call.from_number : call.to_number;
  const durationS = call.duration_ms
    ? Math.round(call.duration_ms / 1000)
    : call.end_timestamp && call.start_timestamp
      ? Math.round((call.end_timestamp - call.start_timestamp) / 1000)
      : 0;

  const signals = readSignals(call.transcript, call.call_analysis);

  let contact = null;
  try {
    contact = await findContactByPhone(leadNumber);
  } catch (err) {
    console.error('[callEvents] contact lookup failed:', err?.message);
  }

  const name = contact
    ? `${contact.properties?.firstname || ''} ${contact.properties?.lastname || ''}`.trim()
    : '';
  const who = name || leadNumber || 'unknown caller';

  // --- HubSpot note (skipped when we can't tell whose record it belongs on)
  if (contact?.id) {
    const outcome = signals.voicemail
      ? 'voicemail'
      : durationS < 15 ? 'very short / no real conversation' : 'live conversation';
    const lines = [
      `${inbound ? 'INBOUND callback' : 'Outbound cadence call'} (Matthew) — ${etStamp(call.start_timestamp)}`,
      `Outcome: ${outcome} · ${durationS}s · call id ${call.call_id}`,
      signals.summary ? `Summary: ${signals.summary}` : '',
      signals.optOut ? 'FLAG: caller may have asked not to be contacted — review before any further touch.' : '',
      signals.possibleBooking ? 'FLAG: a meeting time may have been agreed — needs the booking flow.' : '',
      call.recording_url ? `Recording: ${call.recording_url}` : '',
    ].filter(Boolean);
    try {
      await createNoteOnContact(contact.id, lines.join('\n'));
      if (!inbound) await markAttempted(contact.id, contact.properties?.hs_lead_status);
    } catch (err) {
      console.error('[callEvents] hubspot write failed:', err?.message);
    }
  }

  // --- Email David. Inbound callbacks lead with the ask; outbound reads as a report.
  const flags = [
    signals.optOut ? '<p><b>⚠ Possible opt-out</b> — the caller may have asked not to be contacted. Check before the next touch.</p>' : '',
    signals.possibleBooking ? '<p><b>★ Possible booking</b> — a day and time came up and sounded agreed. Reply to this email and I will verify your calendar and send the Teams invite.</p>' : '',
  ].filter(Boolean).join('');

  const subject = inbound
    ? `Callback to Matthew: ${who}${signals.possibleBooking ? ' — possible booking' : ''}`
    : `Call report: ${who} — ${signals.voicemail ? 'voicemail' : durationS < 15 ? 'no conversation' : 'connected'}`;

  const html = [
    inbound
      ? `<p><b>${esc(who)} called Matthew back</b> at ${esc(etStamp(call.start_timestamp))}.</p>`
      : `<p>Matthew called <b>${esc(who)}</b> at ${esc(etStamp(call.start_timestamp))}.</p>`,
    flags,
    '<p>',
    `<b>Number:</b> ${esc(leadNumber || 'unknown')}<br>`,
    `<b>Length:</b> ${durationS}s${signals.voicemail ? ' (reached voicemail)' : ''}<br>`,
    contact?.id
      ? `<b>HubSpot:</b> <a href="https://app.hubspot.com/contacts/7064094/record/0-1/${esc(contact.id)}">${esc(who)}</a><br>`
      : '<b>HubSpot:</b> no matching contact — new lead or wrong number<br>',
    signals.sentiment ? `<b>Sentiment:</b> ${esc(signals.sentiment)}<br>` : '',
    call.recording_url ? `<b>Recording:</b> <a href="${esc(call.recording_url)}">listen</a><br>` : '',
    '</p>',
    signals.summary ? `<p><b>Summary:</b> ${esc(signals.summary)}</p>` : '',
    '<p><b>Transcript</b></p>',
    transcriptHtml(call.transcript),
  ].join('');

  try {
    await sendMailAsHost({ to: HOST_UPN, subject, html });
  } catch (err) {
    // Most likely cause: the app registration is missing the Mail.Send
    // application permission. The HubSpot note above still landed.
    console.error('[callEvents] email failed:', err?.message);
  }
}

module.exports = { handleMatthewCallEvents };
