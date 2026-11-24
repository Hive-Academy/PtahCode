# Research report — decision model on chappie is slow for `ptah_route_decide`

Date: 2026-11-24. Investigator: child session "Chappie decision host". All remote steps were
read-only. No service, model or configuration was changed.

## Verdict

The host, the model and the tunnel are healthy. The latency comes from the **size of the
router's decision requests** on a **CPU-only** host, plus a saved **60 s timeout** that lets
each `ptah_route_decide` call wait up to 60 s.

- chappie prefills the prompt at about **45–50 tokens/s** (no GPU, `100% CPU`).
- A real router request carries about **4 questions x 500–999 prompt tokens = 2000–2800 tokens**.
  That costs 40–60 s. The earlier "performant" benchmark (11.8 s cold, 5.5–5.9 s warm) used small
  questions.
- The state is repeated for each question and the prompt cache gives no reuse, so cost grows
  linearly with the number of questions.

## 1. Current configuration (primary machine)

| Item | Value | Source |
|---|---|---|
| `decisionModel` | `kind: custom`, `baseUrl: http://127.0.0.1:11435`, `model: d3:4b` | `~/.ptah/settings.json:53-57` |
| `decisionModelTimeoutMs` | `60000` | `~/.ptah/settings.json:61` |
| Request keep-alive | `30m` on every request | `decision-model/system-one.residency.ts:18` |
| Cold-load budget | 60 s, used only when no timeout is saved; a saved timeout bounds every request | `system-one.residency.ts:20-26` |

## 2. Endpoint and tunnel

- `127.0.0.1:11435` is held by `ssh` (pid 2156).
- `ptah-chappie-ollama.service` (user unit): active, running, `127.0.0.1:11435 -> chappie:11434`.
- `ptah-gatsby-ollama.service`: inactive (dead). Gatsby is no longer in the path.
- `~/.ssh/config`: `Host chappie ptah-w4` -> 192.168.100.43. SSH with `BatchMode=yes` works.
- The tunnel adds no measurable latency (`/api/ps` 4 ms; same request 3.0–3.5 s on both sides).

## 3. chappie host state

| Item | Value |
|---|---|
| Ollama | 0.40.13, service `active`, `NRestarts=0`, up since 2026-11-18 |
| Environment | `OLLAMA_KEEP_ALIVE=-1`, `OLLAMA_HOST=127.0.0.1:11434`; `OLLAMA_NUM_PARALLEL`, `OLLAMA_MAX_LOADED_MODELS`, `OLLAMA_CONTEXT_LENGTH` not set |
| `ollama ps` | `d3:4b` 7.1 GB, `100% CPU`, context 4096, runner llamacpp, until `Forever` |
| `ollama list` | `d3:4b` 5.8 GB (3 weeks ago) plus 4 `:cloud` entries |
| Model | qwen35, 4.8B, Q8_0, capabilities `decision`, `vision` |
| llama-server args | `-c 4096 -np 16 --kv-unified --cache-ram ... -b 4096` |
| Hardware | 6 cores, 15 GB RAM (6 GB available), 1 GB swap, no GPU |
| Load | llama-server RSS 7.3 GB (45 % RAM) |

Blob integrity: the manifest is in the `manifests-v2` format, so the digest check script did not
apply. The model loads, serves, and answers the test question with probability 0.9999, so the
blob is not the truncated copy from the earlier note.

## 4. Measurements

From the primary machine through `http://127.0.0.1:11435/v1/systemone`, model warm:

| Request | Input tokens | Total time |
|---|---|---|
| 1 question, short state | 159 | 3.0 s, 3.5 s |
| Same, run on chappie at `127.0.0.1:11434` | 159 | 3.4 s |
| 1 question, real-size state | 590 | 11.7 s, 12.4 s |
| Same state, other question (cache reuse test) | 590 | 12.9 s (no reuse) |
| 4 questions, real-size state | 2361 | 53.2 s |

Time to first token equals total time: the endpoint returns one JSON body (`output_tokens: 0`).
A cold test was not possible without an unload, which needs approval. `OLLAMA_KEEP_ALIVE=-1`
keeps the model resident, so a cold load does not occur in normal use.

Service log today (`journalctl -u ollama`), real `/v1/systemone` calls:

- 26 calls: 10 ended with HTTP 500 at 59.9–60.0 s (the client abort at the 60 s timeout),
  16 returned 200 in 11.8–57.8 s, most of them 39–58 s.
- Tasks per call: usually 4 (one per question). Prompt tokens per task: 74 below 500,
  139 at 500–999, 19 at 1000–1999, maximum 1958.
- 140 lines `failed to find free space in the KV cache`. The 16 slots share one 4096-token
  KV cache. A 4-question batch (about 2700 tokens) does not fit while other prompts hold cache
  space, so llama.cpp retries with smaller batches. This adds delay when two callers overlap.
- The µs-long 400/404 responses are the Ptah capability probe. They are expected.

## 5. Root cause

1. **Payload size (main cause, router code).** Each question repeats about 500–1000 tokens of
   state. Four questions per call make about 2400–2800 prefill tokens at about 48 tokens/s.
2. **Saved timeout 60 s (Ptah setting).** Each call can block 60 s and then fail with HTTP 500.
   With no end-to-end deadline (router R1), `ptah_route_decide` exceeds the MCP call time.
3. **Shared 4096-token KV cache (host, minor).** Overlapping calls from two sessions queue and
   retry. This adds delay but does not change the prefill cost.

The host did not degrade. The earlier benchmark measured small questions.

## 6. Fix options

| # | Owner | Change | Expected effect |
|---|---|---|---|
| F1 | Router task TASK_2026_2326_5d16 | Shrink the decision payload: send the shared state once, or send only the fields each question needs; compact `availableExecutors` and `pastOutcomes`; cap questions per call | Linear: 590 tokens = 12 s, 160 tokens = 3 s |
| F2 | Router task (R1) | Skip the model when the remaining budget is below the measured cost (about 1 s per 48 prompt tokens on this host) | `ptah_route_decide` always returns in time |
| F3 | User setting | Until F1/F2 land, lower `decisionModelTimeoutMs` (for example 15000) or disable the decision model | Calls fall back to the deterministic ranking in 15 s instead of 60 s |
| F4 | Host, needs approval | `OLLAMA_CONTEXT_LENGTH=8192` in the chappie service (KV cache about +0.3–0.6 GB, 6 GB available); optional `OLLAMA_NUM_PARALLEL=4` | Removes KV-full retries when calls overlap; no change to prefill speed |
| F5 | Hardware | A GPU on the decision host | The only change that makes 2000+ token prompts fast |

A Q4 quantization is not recommended without a benchmark: the workload is prefill only, and on
CPU prefill is compute-bound, so Q4 gives little gain.

## Open items

- Cold load time on chappie not measured (needs an unload, which needs approval).
- F4 not applied (remote configuration change needs the user's approval).
