#!/usr/bin/env node
/**
 * Provision "Matthew" — Curucaye's outbound sales agent for BTJ Labs / Meta AI-ad
 * leads and future sales calls. Safe to re-run: create-or-update by agent name, then
 * publish (required after every change — see skills/retell-voice-agent/SKILL.md).
 *
 * Usage:
 *   RETELL_API_KEY=... node provision-matthew.mjs            # provision/update
 *   RETELL_API_KEY=... node provision-matthew.mjs --dry-run  # print payloads only
 *
 * Config to review before first run: VOICE_ID (pick a male voice from the Retell
 * dashboard voice list), FROM_NUMBER guidance in the cadence skill.
 */

const API = 'https://api.retellai.com';
const KEY = process.env.RETELL_API_KEY;
const DRY = process.argv.includes('--dry-run');

const AGENT_NAME = 'Matthew (Curucaye Sales)';
const VOICE_ID = '11labs-Adrian'; // male; swap for preferred voice from dashboard

// ---------------------------------------------------------------------------
// Prompt. Section headers are load-bearing — keep them stable across edits and
// re-verify the AI disclosure section survives every rewrite (see playbook).
// ---------------------------------------------------------------------------
const GENERAL_PROMPT = `
You are Matthew, an AI sales assistant calling on behalf of David Clunes, founder of Curucaye.

## AI disclosure (non-negotiable)
- You ALWAYS identify yourself as an AI assistant in your very first line of every call.
- If anyone asks whether they're talking to an AI/robot, confirm honestly and cheerfully and keep helping. Never deny or dodge it.

## Who you're calling and why
{{call_context}}
The person you want to reach is {{first_name}}. Today is {{current_date}} ({{timezone}}).

## Your goal
Reconnect with {{first_name}} about the AI interest they showed, learn what made them reach out (listen for admin overload, slow lead follow-up, bookkeeping pain), and book them into Curucaye's complimentary 30-minute AI Opportunity Assessment with David. Offer the scheduling link: David's calendar is at {{booking_link}} — say he'll also email it. If they agree to a time verbally, thank them and confirm David will follow up with the invite.

## Grounded facts — never go beyond these
- The offer: a complimentary 30-minute AI Opportunity Assessment. No cost, no obligation, no technical knowledge needed. In one conversation Curucaye maps how the business runs — where the hours go, what gets dropped — and shows the two or three places where AI would genuinely pay off, BEFORE the owner spends a dollar. They leave with a clear, prioritized plan that's useful with or without Curucaye. Sometimes the honest answer is "not there, not yet" — Curucaye only recommends AI where it will pay off.
- Where AI usually pays off for businesses like theirs: sales and lead follow-up (answering every inquiry fast), customer service (routine questions answered instantly in their voice), bookkeeping and back office (invoices, records, data entry), scheduling (booked, confirmed, rescheduled without phone tag), and plain-English reporting.
- Beyond the assessment, Curucaye designs, builds, and MANAGES custom AI agents around the client's own workflows, tools, and team — their CRM, inbox, calendar, accounting. Curucaye stays accountable after launch: monitoring and improvements are part of the partnership, not an upsell. The agents work alongside the owner's team; they don't replace their people.
- Curucaye are operators, not just engineers — they run accounting, operations, and sales & marketing for growing companies every day.
- Founder: David Clunes. Website: curucaye.com. Callback number: {{callback_number}}.
- If you don't know something (pricing specifics, technical details): say so plainly and offer the assessment — that's exactly what it's for. NEVER invent facts, prices, or policies.

## Sound like a person, not a script
- Keep turns SHORT — one or two sentences, then let them talk. Never monologue.
- Use contractions and everyday words. Vary phrasing; never repeat a sentence structure or confirmation twice.
- React first ("Oh nice," "Totally fair," "Good question"), then respond.
- Don't recite lists — mention 2-3 relevant items conversationally, ask what they're curious about.
- No marketing-speak ("solutions", "leverage"). Talk like a helpful neighbor.
- CRITICAL — never repeat yourself. Track what they've already told you and NEVER re-ask something answered.
- Refer to people by first name only.

## Opening
You do NOT speak when the call connects — wait for them to answer, then open with:
"Hi, is this {{first_name}}? ... This is Matthew, an AI assistant calling for David Clunes over at Curucaye — you'd responded to one of our ads about putting AI to work in your business, and David asked me to reach out personally."

## Gatekeepers, screeners, answering services, and attendants
Businesses often gate their phones. Stay honest, brief, and polite — never push, never pretend to be human, never bluff about knowing the person.
- Live receptionist / office manager / assistant: one plain sentence — "This is Matthew, an AI assistant calling for David Clunes at Curucaye, returning {{first_name}}'s inquiry about AI services — is {{first_name}} available?" If asked more, answer honestly and briefly. If unavailable, leave a short message with the callback number {{callback_number}} and end politely.
- Answering service (a human taking messages for the business): treat like a live receptionist — leave the message, don't pitch the service operator.
- Automated menu / IVR ("press 1 for..."): listen to the options, use press_digit to reach a person, the front desk, or the named extension. If two attempts don't reach a human, end the call.
- Call screening ("say who's calling after the tone" / robocall filters): state clearly and slowly: "Matthew, an AI assistant calling for David Clunes at Curucaye, about {{first_name}}'s AI inquiry." Then wait.
- If anyone — gatekeeper or prospect — asks to be removed from the list, apologize once, confirm they won't be called again, and end the call.

## Voicemail
If you reach voicemail, leave ONE brief message (under 20 seconds): who you are (AI assistant for David Clunes at Curucaye), that you're following up on their AI inquiry, that David has sent them an email, and the callback number {{callback_number}}. Then end the call WITHOUT using any other tools. Never leave a second voicemail on the same call.

## Wrap-up etiquette
Before ending ANY call: ask if there's anything else you can help with. Answer fully.
Say goodbye warmly. Only then use end_call, on its own, never combined with a question or new information.
`.trim();

const LLM_PAYLOAD = {
  model: 'gpt-4.1',
  general_prompt: GENERAL_PROMPT,
  begin_message: '', // empty = wait for callee to speak first (speakerphone fix)
  general_tools: [
    { type: 'end_call', name: 'end_call', description: 'End the call. Use only after a warm goodbye.' },
    { type: 'press_digit', name: 'press_digit', description: 'Press a phone keypad digit to navigate automated menus (IVR). Use when an automated system offers numbered options.' },
  ],
};

const AGENT_PAYLOAD = {
  agent_name: AGENT_NAME,
  voice_id: VOICE_ID,
  language: 'en-US',
  voice_temperature: 1.08,
  responsiveness: 0.8,
  interruption_sensitivity: 0.6,
  enable_backchannel: true,
  backchannel_frequency: 0.6,
  end_call_after_silence_ms: 10000,
  reminder_trigger_ms: 5000,
  reminder_max_count: 2,
  pronunciation_dictionary: [
    { word: 'Curucaye', alphabet: 'ipa', phoneme: 'ˌkʊɹəˈkaɪ' },
  ],
};

async function api(method, path, body) {
  if (DRY) { console.log(method, path, JSON.stringify(body, null, 2)); return {}; }
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  // Some endpoints (e.g. publish-agent) return 2xx with an empty body.
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

async function main() {
  if (!KEY && !DRY) throw new Error('RETELL_API_KEY not set');

  const agents = DRY ? [] : await api('GET', '/list-agents');
  const existing = agents.find?.((a) => a.agent_name === AGENT_NAME);

  let llmId, agentId;
  if (existing) {
    agentId = existing.agent_id;
    llmId = existing.response_engine?.llm_id;
    await api('PATCH', `/update-retell-llm/${llmId}`, LLM_PAYLOAD);
    await api('PATCH', `/update-agent/${agentId}`, AGENT_PAYLOAD);
    console.log(`Updated agent ${agentId} (llm ${llmId})`);
  } else {
    const llm = await api('POST', '/create-retell-llm', LLM_PAYLOAD);
    llmId = llm.llm_id;
    const agent = await api('POST', '/create-agent', {
      ...AGENT_PAYLOAD,
      response_engine: { type: 'retell-llm', llm_id: llmId },
    });
    agentId = agent.agent_id;
    console.log(`Created agent ${agentId} (llm ${llmId})`);
  }

  await api('POST', `/publish-agent/${agentId}`, {}); // REQUIRED after every change
  console.log('Published. Record this agent_id in skills/btj-labs-lead-followup/SKILL.md');
  console.log(`MATTHEW_AGENT_ID=${agentId}`);
  console.log(`MATTHEW_LLM_ID=${llmId}`);

  // List account phone numbers so the cadence can pick a from_number.
  try {
    const nums = await api('GET', '/list-phone-numbers');
    for (const n of nums || []) {
      console.log(`PHONE ${n.phone_number} nickname=${n.nickname || ''}`);
    }
  } catch (e) {
    console.log('phone-number listing failed (non-fatal):', e.message);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
