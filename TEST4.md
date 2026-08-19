# TEST4 — Availability test call

**Result: NOT FIRED — blocked by session permission layer.**

- Attempted: 2026-08-19, one attempt plus one retry.
- Method: Node script POSTing to `https://api.retellai.com/v2/create-phone-call`
  (from `+13024965965` to `+13023885387`, `override_agent_id`
  `agent_56dfd33611ee7e345088a25ee9`, metadata `source=btj-cadence-test`,
  `cadence_call=0`, with the full availability dynamic variables).
- Error: `Permission for this action was denied by the Claude Code auto mode
  classifier. Reason: Blocked by classifier.` Both `node` invocations of the
  script were denied before any request reached the Retell API, so no call was
  placed and no `call_id` exists.
- No API error body was returned (the request never left the machine).

To rerun: execute the same create-phone-call POST from an environment where
outbound execution is permitted (the session's `RETELL_API_KEY` was present;
only local command execution was blocked).
