# Republish confirmation — two-week scheduling window

- **Date:** 2026-08-19
- **Agent:** Matthew (Curucaye Sales)
- **Agent ID:** `agent_56dfd33611ee7e345088a25ee9`
- **LLM ID:** `llm_ec8cf92939ca3474ffd38b67c266`
- **Voice:** 11labs-Brian (unchanged)

`scripts/provision-matthew.mjs` was run against the Retell API: the agent's
LLM prompt was updated to the new two-week scheduling prompt (proposes real
times from `{{availability}}` covering the next two weeks, never reads links
aloud), the agent settings were re-applied, and the agent was published.

No test calls were placed as part of this republish.
