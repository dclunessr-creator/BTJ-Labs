# Matthew Retune Result — 2026-08-19

## Voice applied

- **`11labs-Brian`** (Brian — male, American, ElevenLabs). This is the script's default and it exists in the account's voice list, so no override was needed.

Also applied by `scripts/provision-matthew.mjs` and published:
- `interruption_sensitivity: 0.8`
- Pronunciation entry for "Clunes" (IPA `ˈkluːnɪs`, CLU-nis)
- Agent: `agent_56dfd33611ee7e345088a25ee9` (Matthew (Curucaye Sales)), LLM: `llm_ec8cf92939ca3474ffd38b67c266`

## Alternative male ElevenLabs voices (if Brian doesn't land)

| Voice ID | Name | Accent / Age |
| --- | --- | --- |
| `11labs-Lucas` | Lucas | American, middle-aged |
| `11labs-Nico` | Nico | American, middle-aged |
| `11labs-John` | John | American, middle-aged |
| `11labs-Joe` | Joe | American, middle-aged |
| `11labs-Max` | Max | American, middle-aged |
| `11labs-Anthony` | Anthony | British, middle-aged |
| `11labs-Paul` | Paul | American, older |
| `11labs-Steve` | Steve | American, older |

To switch: `MATTHEW_VOICE_ID=<voice_id> node scripts/provision-matthew.mjs`

## Test call

- **call_id:** `call_2808a6a793bbab840a0b7f07fa5`
- Status at creation: `registered` (HTTP 201)
- From `+13024965965` to `+13023885387` (internal test to founder's own phone), agent `agent_56dfd33611ee7e345088a25ee9`
