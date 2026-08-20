# Provision result — Matthew agents (2026-08-20)

Command: `node scripts/provision-matthew.mjs` (exit code 0)

```
Updated agent agent_56dfd33611ee7e345088a25ee9 (llm llm_ec8cf92939ca3474ffd38b67c266)
Published. Record this agent_id in skills/btj-labs-lead-followup/SKILL.md
MATTHEW_AGENT_ID=agent_56dfd33611ee7e345088a25ee9
MATTHEW_LLM_ID=llm_ec8cf92939ca3474ffd38b67c266
PHONE +13028467571 nickname=Cash Flow Compass Support
PHONE +13022869802 nickname=Customer Success Agent
PHONE +13023064872 nickname=curucaye internal
PHONE +13024965965 nickname=
MATTHEW_INBOUND_AGENT_ID=agent_fadfc0fa9bf090edba6ea7e64a
MATTHEW_INBOUND_LLM_ID=llm_6d888536efbc9439c9005eca4bd1
inbound binding failed — bind +13024965965 to the inbound agent in the Retell dashboard: PATCH /update-phone-number/+13024965965 -> 400: {"status":"error","message":"Deprecated API usage is no longer supported: Phone number single-agent fields. Fields: inbound_agent_id. Migration details: https://docs.retellai.com/deprecation-notice/2026/03-31_phone_number_agent_fields"}
```
