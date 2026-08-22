/**
 * Offline smoke test for matthewCallEvents. No network, no credentials —
 * fetch is stubbed and every outbound call is recorded and asserted.
 *
 *   cd functions && node test/smoke-call-events.mjs
 *
 * Covers the paths that are awkward to exercise with a real phone call:
 * token rejection, event filtering, duplicate delivery, and the two shapes of
 * notification (inbound callback vs outbound call report).
 */

process.env.BTJ_WEBHOOK_TOKEN = 'test-token';
process.env.HUBSPOT_API_KEY = 'hs-test';
process.env.MS_TENANT_ID = 'tenant';
process.env.MS_CLIENT_ID = 'client';
process.env.MS_CLIENT_SECRET = 'secret';

const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const { handleMatthewCallEvents } = require('../src/matthewCallEvents.js');

let calls = [];
globalThis.fetch = async (url, opts = {}) => {
  // The Graph token request is form-encoded; everything else is JSON.
  let body = null;
  if (opts.body) {
    try { body = JSON.parse(opts.body); } catch { body = String(opts.body); }
  }
  calls.push({ url: String(url), method: opts.method || 'GET', body });
  if (String(url).includes('login.microsoftonline.com')) {
    return json({ access_token: 'tok', expires_in: 3600 });
  }
  if (String(url).includes('/contacts/search')) {
    return json({
      results: [{
        id: '242580205465',
        properties: { firstname: 'Kathleen', lastname: 'Bloomingberg', hs_lead_status: 'NEW' },
      }],
    });
  }
  return json({ ok: true });
};
function json(obj) {
  return { ok: true, status: 200, json: async () => obj, text: async () => JSON.stringify(obj) };
}

function mockRes() {
  const r = { code: null, payload: null, sent: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (p) => { r.payload = p; return r; };
  r.send = (s) => { r.sent = s; return r; };
  return r;
}

let failures = 0;
function check(label, cond, detail = '') {
  if (cond) { console.log(`  ok  ${label}`); }
  else { console.log(`FAIL  ${label}${detail ? ' — ' + detail : ''}`); failures++; }
}

const analyzedInbound = (over = {}) => ({
  event: 'call_analyzed',
  call: {
    call_id: 'call_test_inbound_1',
    direction: 'inbound',
    from_number: '+17736917203',
    to_number: '+13024965965',
    start_timestamp: 1755792000000,
    duration_ms: 96000,
    recording_url: 'https://example.invalid/rec.wav',
    transcript:
      'Agent: Thanks for calling Koo-rah-kye.\n' +
      'User: Hi, returning the call. Tuesday at 2 pm works for me, that sounds good.\n',
    call_analysis: { call_summary: 'Caller returned the call.', user_sentiment: 'Positive', in_voicemail: false },
    ...over,
  },
});

console.log('\n1. rejects a request with no token');
{
  calls = [];
  const res = mockRes();
  await handleMatthewCallEvents({ method: 'POST', query: {}, body: analyzedInbound() }, res);
  check('403 returned', res.code === 403, `got ${res.code}`);
  check('no side effects', calls.length === 0, `${calls.length} fetches`);
}

console.log('\n2. rejects a wrong token');
{
  calls = [];
  const res = mockRes();
  await handleMatthewCallEvents({ method: 'POST', query: { token: 'nope' }, body: analyzedInbound() }, res);
  check('403 returned', res.code === 403, `got ${res.code}`);
  check('no side effects', calls.length === 0, `${calls.length} fetches`);
}

console.log('\n3. ignores non-analyzed events');
{
  calls = [];
  const res = mockRes();
  await handleMatthewCallEvents(
    { method: 'POST', query: { token: 'test-token' }, body: { event: 'call_started', call: { call_id: 'x' } } },
    res
  );
  check('200 returned', res.code === 200, `got ${res.code}`);
  check('marked ignored', res.payload?.ignored === 'call_started');
  check('no side effects', calls.length === 0, `${calls.length} fetches`);
}

console.log('\n4. inbound callback: HubSpot note + email to David');
{
  calls = [];
  const res = mockRes();
  await handleMatthewCallEvents({ method: 'POST', query: { token: 'test-token' }, body: analyzedInbound() }, res);
  check('200 returned', res.code === 200, `got ${res.code}`);

  const note = calls.find((c) => c.url.includes('/objects/notes'));
  check('note created', !!note);
  check('note is on the matched contact',
    note?.body?.associations?.[0]?.to?.id === '242580205465');
  check('note records it as an inbound callback',
    /INBOUND callback/.test(note?.body?.properties?.hs_note_body || ''));
  check('note carries the recording link',
    /example\.invalid\/rec\.wav/.test(note?.body?.properties?.hs_note_body || ''));
  check('note flags the possible booking',
    /meeting time may have been agreed/.test(note?.body?.properties?.hs_note_body || ''));

  const mail = calls.find((c) => c.url.includes('/sendMail'));
  check('email sent', !!mail);
  check('addressed to David',
    mail?.body?.message?.toRecipients?.[0]?.emailAddress?.address === 'dclunessr@curucaye.com');
  check('subject names the caller and the booking',
    /Callback to Matthew: Kathleen Bloomingberg — possible booking/.test(mail?.body?.message?.subject || ''),
    mail?.body?.message?.subject);
  check('body includes the transcript',
    /Tuesday at 2 pm works for me/.test(mail?.body?.message?.body?.content || ''));

  check('inbound does NOT touch lead status',
    !calls.some((c) => c.method === 'PATCH' && c.url.includes('/objects/contacts/')));
}

console.log('\n5. duplicate delivery of the same call is suppressed');
{
  calls = [];
  const res = mockRes();
  await handleMatthewCallEvents({ method: 'POST', query: { token: 'test-token' }, body: analyzedInbound() }, res);
  check('200 returned', res.code === 200, `got ${res.code}`);
  check('marked duplicate', res.payload?.ignored === 'duplicate delivery', JSON.stringify(res.payload));
  check('no second note or email', calls.length === 0, `${calls.length} fetches`);
}

console.log('\n6. outbound voicemail: report email + status advanced');
{
  calls = [];
  const res = mockRes();
  await handleMatthewCallEvents({
    method: 'POST',
    query: { token: 'test-token' },
    body: {
      event: 'call_analyzed',
      call: {
        call_id: 'call_test_outbound_1',
        direction: 'outbound',
        from_number: '+13024965965',
        to_number: '+17736917203',
        start_timestamp: 1755792000000,
        duration_ms: 25000,
        transcript: 'User: please record your message.\nAgent: Hi, this is Matthew...\n',
        call_analysis: { call_summary: 'Left a voicemail.', user_sentiment: 'Neutral', in_voicemail: true },
      },
    },
  }, res);
  check('200 returned', res.code === 200, `got ${res.code}`);

  const note = calls.find((c) => c.url.includes('/objects/notes'));
  check('note records it as an outbound call',
    /Outbound cadence call/.test(note?.body?.properties?.hs_note_body || ''));
  check('note records the voicemail outcome',
    /Outcome: voicemail/.test(note?.body?.properties?.hs_note_body || ''));
  check('no false booking flag on a voicemail',
    !/meeting time may have been agreed/.test(note?.body?.properties?.hs_note_body || ''));

  const patch = calls.find((c) => c.method === 'PATCH' && c.url.includes('/objects/contacts/'));
  check('lead advanced to ATTEMPTED_TO_CONTACT',
    patch?.body?.properties?.hs_lead_status === 'ATTEMPTED_TO_CONTACT');

  const mail = calls.find((c) => c.url.includes('/sendMail'));
  check('report subject reads as a voicemail',
    /Call report: Kathleen Bloomingberg — voicemail/.test(mail?.body?.message?.subject || ''),
    mail?.body?.message?.subject);
}

console.log('\n7. opt-out language is flagged');
{
  calls = [];
  const res = mockRes();
  await handleMatthewCallEvents({
    method: 'POST',
    query: { token: 'test-token' },
    body: analyzedInbound({
      call_id: 'call_test_optout',
      transcript: 'User: Please take me off your list and stop calling.\n',
      call_analysis: { call_summary: 'Opt-out.', user_sentiment: 'Negative', in_voicemail: false },
    }),
  }, res);
  const note = calls.find((c) => c.url.includes('/objects/notes'));
  check('note flags the opt-out',
    /may have asked not to be contacted/.test(note?.body?.properties?.hs_note_body || ''));
  const mail = calls.find((c) => c.url.includes('/sendMail'));
  check('email flags the opt-out',
    /Possible opt-out/.test(mail?.body?.message?.body?.content || ''));
}

console.log('\n8. a failing email still leaves the HubSpot note behind');
{
  calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes('/sendMail')) {
      return { ok: false, status: 403, text: async () => 'no Mail.Send permission' };
    }
    return realFetch(url, opts);
  };
  const res = mockRes();
  await handleMatthewCallEvents({
    method: 'POST',
    query: { token: 'test-token' },
    body: analyzedInbound({ call_id: 'call_test_mailfail' }),
  }, res);
  globalThis.fetch = realFetch;
  check('still returns 200', res.code === 200, `got ${res.code}`);
  check('note was still written', calls.some((c) => c.url.includes('/objects/notes')));
}

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
