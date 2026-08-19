# Test 3 — Prompt republish + third test call

Date: Wednesday, August 19, 2026

## Step 1 — Provision & publish

`node scripts/provision-matthew.mjs` updated and published the existing agent with the
new availability-based scheduling prompt (voice unchanged: 11labs-Brian).

- Agent: Matthew (Curucaye Sales)
- MATTHEW_AGENT_ID=agent_56dfd33611ee7e345088a25ee9
- MATTHEW_LLM_ID=llm_ec8cf92939ca3474ffd38b67c266
- Publish: succeeded (`POST /publish-agent/agent_56dfd33611ee7e345088a25ee9` returned 2xx)

## Step 2 — Test call

`POST /v2/create-phone-call` returned HTTP 201.

- call_id: `call_edbf43428f09218a2eceab4eec5`
- agent_version: 4
- call_status at creation: registered
- from: +13024965965 → to: +13023885387 (internal test call to the founder's own phone)
- metadata: crm_contact_id=test, source=btj-cadence-test, cadence_call=0
- Dynamic variables included availability for Thu Aug 20 (10 AM–3 PM Eastern) and
  Fri Aug 21 (mid-day), callback number +1 302-496-5965.
