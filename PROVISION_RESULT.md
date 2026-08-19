# Matthew provisioning result

MATTHEW_AGENT_ID=agent_56dfd33611ee7e345088a25ee9
MATTHEW_LLM_ID=llm_ec8cf92939ca3474ffd38b67c266
PHONE +13028467571 nickname=Cash Flow Compass Support
PHONE +13022869802 nickname=Customer Success Agent
PHONE +13023064872 nickname=curucaye internal
PHONE +13024965965 nickname=

## Notes

`node scripts/provision-matthew.mjs` created the agent and LLM, but crashed
before printing the result lines: the `POST /publish-agent` response returned
a 2xx status with an empty body, and the script's `res.json()` threw
`SyntaxError: Unexpected end of JSON input` (provision-matthew.mjs:139 via the
`api()` helper). The publish itself had already succeeded server-side.

Publish and phone-number listing were completed/verified with direct API calls:
`GET /get-agent-versions/agent_56dfd33611ee7e345088a25ee9` shows versions 0 and
1 with `is_published=true` (version 2 is the current unpublished draft head,
which is normal after publishing). The result lines above are taken from those
verified API responses and match the format the script would have printed.
