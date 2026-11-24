# Research report — decision model on chappie is slow for `ptah_route_decide`

Date: 2026-11-24. Investigator: child session "Chappie decision host". All remote steps of the
investigator were read-only. The investigator changed no service, model or configuration.
Revised after the codex review (`research-report-review.md`, round 1).

## Verdict

The host, the model and the tunnel are healthy. The latency comes from the **prompt size of the
router's decision requests** on a **CPU-only** host. At measurement time, a saved **60 s timeout**
let each model POST wait up to 60 s.

- chappie processes about **44–50 input tokens/s** (effective rate: input tokens divided by
  total response time; rough working figure 48). There is no GPU (`100% CPU`).
- Ptah sends the shared state once. The server runs one task per question, and server input
  tokens grow about linearly with the number of questions: 1 question = 590 tokens, the same
  4 questions = 2361 tokens (about 4 x 590). This suggests that each question's server prompt
  includes the state. It is an inference from `input_tokens`, not from a server trace.
- Real router calls observed today took 11.8–57.8 s when they succeeded, most in 39–58 s
  (section 4). The earlier "performant" benchmark (11.8 s cold, 5.5–5.9 s warm) used small
  questions.

## 1. Configuration at measurement time (primary machine)

| Item | Value | Source |
|---|---|---|
| `decisionModel` | `kind: custom`, `baseUrl: http://127.0.0.1:11435`, `model: d3:4b` | `~/.ptah/settings.json:53-57` |
| `decisionModelTimeoutMs` | `60000` at measurement time; the parent later set `15000` (see Status) | `~/.ptah/settings.json:61` |
| Target type | A custom target uses `probe: 'endpoint'`, also on a loopback URL | `decision-model/decision-model.target.ts:193-229,314-334` |
| Request `keep_alive` | **Not sent** for this custom target. `30m` and the 60 s cold budget apply only to a local target with `probe: 'daemon'` | `system-one.residency.ts:17-26`, `system-one.client.ts:110-121` |
| Residency probe | `GET /api/ps` with a 1 s deadline, daemon targets only, and only when a larger cold budget is available | `system-one.residency.ts:28-32,54-64` |
| Saved timeout | Bounds each System One POST and its response body, also a cold call | `system-one.client.ts:176-204,253-270` |

The custom target sends no `keep_alive`, but the chappie service sets `OLLAMA_KEEP_ALIVE=-1`
(section 3), so the model stays loaded.

## 2. Endpoint and tunnel

- `127.0.0.1:11435` is held by the `ssh` process of the tunnel unit.
- `ptah-chappie-ollama.service` (user unit): active, running, `127.0.0.1:11435 -> chappie:11434`.
- `ptah-gatsby-ollama.service`: inactive (dead). Gatsby is no longer in the path.
- `~/.ssh/config` has a `Host chappie` entry. SSH with `BatchMode=yes` works.
- The tunnel adds no measurable latency: the same request took 3.0–3.5 s through the tunnel and
  3.4 s on chappie. A `GET /api/ps` round trip through the tunnel took 4 ms.

## 3. chappie host state

| Item | Value |
|---|---|
| Ollama | 0.40.13, service `active`, `NRestarts=0`, up since 2026-11-18 |
| Environment | `OLLAMA_KEEP_ALIVE=-1`, `OLLAMA_HOST=127.0.0.1:11434`; `OLLAMA_NUM_PARALLEL`, `OLLAMA_MAX_LOADED_MODELS`, `OLLAMA_CONTEXT_LENGTH` not set |
| `ollama ps` | `d3:4b` 7.1 GB, `100% CPU`, context 4096, runner llamacpp, until `Forever` |
| `ollama list` | `d3:4b` 5.8 GB (3 weeks ago) plus 4 `:cloud` entries |
| Model | qwen35, 4.8B, Q8_0, capabilities `decision`, `vision` |
| llama-server args | `-c 4096 -np 16 --kv-unified --cache-ram ... -b 4096` |
| Hardware | 6 cores, 15 GB RAM (`free -g`: 6 GB available), 1 GB swap, no GPU |
| Load | llama-server RSS 7.3 GB (`ps` `%MEM` 45.1; `ps` uses total memory in KiB, `free -g` rounds down) |

Blob integrity: the manifest is in the `manifests-v2` format, so the digest check script did not
apply. The model loads, serves, and answers the test question with probability 0.9999, so the
blob is not the truncated copy from the earlier note.

## 4. Measurements

From the primary machine through `http://127.0.0.1:11435/v1/systemone`, model warm. Rates are
effective input tokens per second against total response time.

| Request | Server input tokens | Total time | Rate |
|---|---|---|---|
| 1 question, short state | 159 | 3.0 s, 3.5 s | — (fixed cost dominates) |
| Same, run on chappie at `127.0.0.1:11434` | 159 | 3.4 s | — |
| 1 question, real-size state | 590 | 11.7 s, 12.4 s | 50.4, 47.6 tokens/s |
| Same state, other question | 590 | 12.9 s | no speed-up seen in this one trial |
| 4 questions, real-size state | 2361 | 53.2 s | 44.4 tokens/s |

Time to first token equals total time: the endpoint returns one JSON body (`output_tokens: 0`).
A cold test was not possible without an unload, which needs approval. `OLLAMA_KEEP_ALIVE=-1`
keeps the model resident, so a cold load does not occur in normal use.

Service log today (`journalctl -u ollama --since today`):

- GIN lines for `/v1/systemone` with a real duration, read before the investigator's own tests:
  26 calls. 10 returned HTTP 500 at 59.9–60.0 s, which matches the 60 s client timeout.
  16 returned 200 in 11.8–57.8 s, most in 39–58 s. The server log alone cannot prove that the
  client abort caused each 500.
- Prompt sizes: all `new prompt ... task.n_tokens` lines of the day, read after the investigator's
  first tests, 232 lines: 74 below 500, 139 at 500–999, 19 at 1000–1999, maximum 1958. These
  lines are llama-server tasks, not calls. They include the investigator's tests and can include
  retried or re-queued tasks, so they are not a per-call count.
- In the sampled recent time windows, a call started 4 tasks at the same time (one per question).
- 140 lines `failed to find free space in the KV cache`. The 16 slots share one 4096-token
  KV cache. A 4-question batch (about 2700 tokens) does not fit while other prompts hold cache
  space, so llama.cpp retries with smaller batches. This adds delay when two callers overlap.
- The µs-long 400/404 responses are the Ptah capability probe. They are expected.

## 5. Root cause

1. **Server prompt size (main cause).** Ptah sends one shared state (`decision-payload.ts:75-118`).
   The server input tokens grow with the number of questions, which suggests (not proven by a
   trace) that each question's prompt includes the state. Lane-choice criteria also repeat
   executor details. Most successful calls observed today took 39–58 s. In the 1-question
   trials the rate was 50.4 tokens/s (11.7 s run) and 47.6 tokens/s (12.4 s run), in the
   4-question trial 44.4 tokens/s.
2. **Saved timeout 60 s at measurement time (Ptah setting).** Each model POST could block 60 s
   and then fail. With no end-to-end deadline (router R1), `ptah_route_decide` exceeded the MCP
   call time.
3. **Shared 4096-token KV cache (host, minor).** Overlapping calls from two sessions queue and
   retry. This adds delay but does not change the prefill cost.

The host did not degrade. The earlier benchmark measured small questions.

## 6. Fix options

| # | Owner | Change | Expected effect |
|---|---|---|---|
| F1 | Router task TASK_2026_2326_5d16 | Cut the server tokens per call: compact the shared state (request text, `availableExecutors`, `pastOutcomes`) and the lane criteria while keeping the required facts; cap the questions sent to the model per call and answer the rest deterministically. Measure server `input_tokens` and latency after the change | Cost is about questions x (state + criteria). 590 tokens = 12 s, 160 tokens = 3 s on this host |
| F2 | Router task (R1) | Use the estimate (about 1 s per 48 server input tokens on this host) only as a skip rule. For the deadline, reserve time for the fallback and cap the model POST at the remaining budget after that reserve | `ptah_route_decide` returns within its deadline also when the model call is slow or queued |
| F3 | User setting | Lower `decisionModelTimeoutMs` (applied: 15000), or disable the decision model | A model POST that is still pending at 15 s is aborted, and on that timeout the router falls back to the deterministic ranking; a faster POST returns normally; a disabled model skips the POST |
| F4 | Host, needs approval | `OLLAMA_CONTEXT_LENGTH=8192` in the chappie service (more KV cache memory; 6 GB available); optional `OLLAMA_NUM_PARALLEL=4` | Removes KV-full retries when calls overlap; no change to prefill speed |
| F5 | Hardware | A GPU on the decision host | The only change that makes 2000+ token prompts fast |

A Q4 quantization is not recommended without a benchmark: the workload is prefill only, and on
CPU prefill is compute-bound, so Q4 gives little gain.

## Status of the fixes (2026-11-24)

- F1, F2: forwarded by the parent session to TASK_2026_2326_5d16.
- F3: applied by the parent session with the user's approval: `decisionModelTimeoutMs`
  60000 -> 15000.
- F4: approved by the user and applied; no effect for `d3:4b` (section 7).

## 7. F4 and cold-load results (approved by the user, 2026-11-24, relayed by the parent)

Change applied on chappie: backup of `/etc/systemd/system/ollama.service.d/` to
`~/ollama.service.d.bak-20261124-f4`, new drop-in `context-length.conf` with
`Environment="OLLAMA_CONTEXT_LENGTH=8192"`, `daemon-reload`, `restart ollama`.
`OLLAMA_NUM_PARALLEL` was not changed: the report listed it only as optional, and it does not
change throughput. After the restart, the service is `active` with `OLLAMA_CONTEXT_LENGTH=8192`,
`OLLAMA_KEEP_ALIVE=-1`, and `d3:4b` is resident `Forever`.

**F4 has no effect for this model.** llama-server still runs with `-c 4096 -np 16`, because the
`d3:4b` Modelfile sets `PARAMETER num_ctx 4096`, and a model parameter overrides
`OLLAMA_CONTEXT_LENGTH`. A larger KV cache needs a derived model (for example a Modelfile
`FROM d3:4b` with `PARAMETER num_ctx 8192`) and a change of the Ptah model id. That is a new
model and is not approved. The drop-in stays in place (approved, no effect); remove it with
`sudo rm` of the file, `daemon-reload` and a restart if it is not wanted.

Measurements through `127.0.0.1:11435` (requests without `keep_alive`):

| Test | Before F4 | After F4 |
|---|---|---|
| Warm, 4 questions, 2361 tokens | 51.2 s | 51.5 s |
| Two overlapping 4-question callers | A 51.8 s, B 103.7 s (run one after the other) | B 90.3 s (A not captured) |
| `failed to find free space in the KV cache` lines, single call | 3 | 1 |
| Same, overlap test | 0 | 1 |
| Cold: first 159-token request after unload | 17.3 s (`ollama stop`, then request; warm = 3.5 s) | 54.0 s after the restart, not valid: an outside call (HTTP 500 at 59.98 s, 18:31:30) ran at the same time |

Conclusions:

- The cold load costs about 14 s (17.3 s - 3.5 s). With `OLLAMA_KEEP_ALIVE=-1` it happens only
  after a service restart or an explicit unload.
- The server runs two overlapping `/v1/systemone` calls one after the other, so a second caller
  waits for the first one. The KV-full retries were rare in these tests and are not a cause.
- A request `keep_alive` value replaces the server value. A test request with `"30m"` changed
  the residency from `Forever` to 30 minutes. The custom target sends no `keep_alive`, but a
  daemon target sends `30m` (`system-one.residency.ts:18`).
- At 18:31:30, after the parent set `decisionModelTimeoutMs` to 15000, a caller still aborted at
  about 60 s. A running Ptah process or another client still uses the 60 s timeout.

## Open items

- F4 had no effect (see section 7). A derived model with `num_ctx 8192` needs a new decision.
- A caller still uses a 60 s timeout after the F3 change (see section 7).
- Per-question token attribution inside the Ollama renderer is inferred from `input_tokens`
  (590 vs 2361), not from a server trace.
