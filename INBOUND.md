# Matthew Inbound provisioning result

Result lines (verified 2026-08-20 via read-only Retell API queries — the
provisioning run itself was executed outside this session):

MATTHEW_AGENT_ID=agent_56dfd33611ee7e345088a25ee9
MATTHEW_LLM_ID=llm_ec8cf92939ca3474ffd38b67c266
PHONE +13028467571 nickname=Cash Flow Compass Support
PHONE +13022869802 nickname=Customer Success Agent
PHONE +13023064872 nickname=curucaye internal
PHONE +13024965965 nickname=
MATTHEW_INBOUND_AGENT_ID=agent_fadfc0fa9bf090edba6ea7e64a
MATTHEW_INBOUND_LLM_ID=llm_6d888536efbc9439c9005eca4bd1

## Inbound binding: CONFIRMED WORKING — via inbound webhook

Inbound calls to +13024965965 are answered by Matthew Inbound, confirmed
by a live test call on 2026-08-20 (David called the number and got the
Matthew Inbound greeting).

Routing detail: the number-level `inbound_agent_id` field is NOT set
(`GET /get-phone-number/+13024965965` shows it empty — the script's
`PATCH /update-phone-number` binding step never took effect). Instead,
the number has an `inbound_webhook_url` configured
(matthewinboundwebhook-y7n6immc4a-uc.a.run.app, set 2026-08-19/20),
and that webhook routes incoming calls to the Matthew Inbound agent
(agent_fadfc0fa9bf090edba6ea7e64a). The webhook is the intended inbound
path; no dashboard binding is needed. If the webhook is ever removed,
set the number's inbound agent to Matthew Inbound as a fallback.
