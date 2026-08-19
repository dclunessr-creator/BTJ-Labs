# Test 6 — time-verification republish + test call

Date: 2026-08-19

## Step 1 — republish (`node scripts/provision-matthew.mjs`)

```
Updated agent agent_56dfd33611ee7e345088a25ee9 (llm llm_ec8cf92939ca3474ffd38b67c266)
Published. Record this agent_id in skills/btj-labs-lead-followup/SKILL.md
MATTHEW_AGENT_ID=agent_56dfd33611ee7e345088a25ee9
MATTHEW_LLM_ID=llm_ec8cf92939ca3474ffd38b67c266
```

The republished prompt includes the hardened time-verification rule
(re-verify every proposed or changed time against the availability list,
commit ffa6e02).

## Step 2 — test call (`node scripts/fire-call.mjs calls/test6.json`)

```
CALL_ID=call_9ab195b7781be8ebf0907353e0d
```

Internal test call to the founder's own phone per `calls/test6.json`.
