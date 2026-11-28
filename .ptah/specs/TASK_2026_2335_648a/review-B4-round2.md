# Code Logic Re-Review — Batch B4 (Round 2)

- **Verdict**: APPROVED
- **Score**: 8/10
- **Scoring basis**: Sits in the 7–8 (sound) band. All four Round-1 defects in `libs/backend/agent-generation/src/lib/services/orchestrator.service.ts` and `scripts/regen-agents.mjs` are fixed with matching spec coverage in `orchestrator.service.spec.ts` and `scripts/regen-agents.spec.mjs`, and all focused checks pass (`144/144` Jest, `7/7` `node --test`, `tsc --noEmit`, `eslint`, and `regen-agents.mjs` dry-run across all 14 `.claude/agents/*.md` files). It does not reach 9–10 (exemplary) because three non-blocking edge cases remain (trailing whitespace after a quoted scalar in `regen-agents.mjs`, uncapped overlong fallback strings, and `\uXXXX` decoding in `decodeScalar`) plus one stale spec title. It is well above 5–6 because no Blocking or Serious defects remain on production or repository paths.

## Round-1 Defects Verification

| Defect | Fixed? | Evidence (`file:line`) |
|---|---|---|
| 1. Empty `description: ""` emitted for overlong single tokens and whitespace-only descriptions | Yes | `libs/backend/agent-generation/src/lib/services/orchestrator.service.ts:95-98,129-130,1320-1327` (normalizes `\s+`/trims before fallback `${this.humanizeName(template.name)} agent`; hard-caps single unbroken token at `boundedLength` code points, never empty); `scripts/regen-agents.mjs:16-19,41,64-66` (same fallback `${agentId} agent` and hard-cap). Covered by `libs/backend/agent-generation/src/lib/services/orchestrator.service.spec.ts:773-795` and `scripts/regen-agents.spec.mjs:22-25,52-55`. |
| 2. Not multi-byte / UTF-16 surrogate-pair safe, and no multi-byte spec coverage | Yes | `libs/backend/agent-generation/src/lib/services/orchestrator.service.ts:87-92,100-108` and `scripts/regen-agents.mjs:8-13,21-30` iterate Unicode code points via `Array.from(normalized)` and slice only by code-point index while tracking JSON/YAML serialized width, keeping surrogate pairs intact. Covered by `libs/backend/agent-generation/src/lib/services/orchestrator.service.spec.ts:797-805` (`'x'.repeat(199) + '🚀tail'`) and `scripts/regen-agents.spec.mjs:27-31`. |
| 3. `capAgentDescription` slices at 200 before checking sentence/word boundaries (mid-token dotted cut and off-by-one word drop) | Yes | `libs/backend/agent-generation/src/lib/services/orchestrator.service.ts:111-127` and `scripts/regen-agents.mjs:32-40` inspect `codePoints[index + 1]` in the full `codePoints` array before accepting `[.!?]` as a sentence end (preventing mid-token cuts on `v1.2.3`) and check `codePoints[boundedLength]` for whitespace before scanning backward (retaining a complete word ending cleanly at budget index 200). Covered by `libs/backend/agent-generation/src/lib/services/orchestrator.service.spec.ts:807-823` and `scripts/regen-agents.spec.mjs:33-38`. |
| 4. `scripts/regen-agents.mjs` whitespace normalization, sentence preference, YAML quoting/scope edge bugs, and `orchestrator.service.ts` post-cap escaping | Yes | `scripts/regen-agents.mjs:16-70` normalizes `\s+`, prefers sentence boundaries, scopes edits strictly to the initial `^(---\r?\n)([\s\S]*?)(\r?\n---(?=\r?\n|$))` frontmatter block, preserves CRLF, decodes double-quoted escapes in one pass (`/\\(.)/gs`) and YAML single-quoted `''`, and re-emits via `JSON.stringify`. `libs/backend/agent-generation/src/lib/services/orchestrator.service.ts:87-92,100-108,1327` budgets serialized YAML double-quoted escape width (`"`, `\`, control chars) before capping and emits via `JSON.stringify`. Covered by `libs/backend/agent-generation/src/lib/services/orchestrator.service.spec.ts:825-832` and `scripts/regen-agents.spec.mjs:40-50`. |

## New Defects (Non-Blocking)

1. **[Moderate]** `scripts/regen-agents.mjs:44-53,63` — Trailing horizontal whitespace after a quoted YAML scalar causes double-quoting corruption.
   - `capDescription` strips only trailing `\r` (`lines[index].replace(/^description:[ \t]*/, '').replace(/\r$/, '')`), leaving trailing spaces/tabs intact. For valid YAML such as `description: "hello world"   `, `raw.endsWith('"')` is false, so `decodeScalar` falls through to `raw.trim()` and returns literal `"hello world"`, which `JSON.stringify` then emits as `description: "\"hello world\""`. Similarly, `decodeScalar` does not check `raw.length >= 2` (unlike `transform-rules.ts:197-200`).
   - **Fix**: Trim `raw` before quote detection (`const trimmed = raw.trim();`) and require `trimmed.length >= 2` on both double-quoted and single-quoted branches in `decodeScalar`, matching `extractFrontmatterDescription` in `libs/backend/harness-sync/src/lib/targets/transformers/transform-rules.ts:193-202`.

2. **[Moderate]** `libs/backend/agent-generation/src/lib/services/orchestrator.service.ts:96-98` and `scripts/regen-agents.mjs:17-19` — `safeFallback` bypasses the 200-character budget.
   - When `description` is empty or whitespace-only, `if (!normalized) return safeFallback;` returns `safeFallback` directly without running the serialized-length cap loop. Passing a fallback longer than 200 serialized characters (e.g., `truncateAgentDescription('   ', 'a'.repeat(250))`) returns 250 characters.
   - **Fix**: Replace the early return with `const normalized = description.replace(/\s+/g, ' ').trim() || safeFallback;` so fallback values go through the same 200-char code-point and escape-width budget.

3. **[Minor]** `scripts/regen-agents.mjs:46-49` — `decodeScalar` does not decode `\uXXXX` JSON/YAML escapes.
   - `JSON.stringify` emits `\uXXXX` for control characters `< 0x20` (and `serializedDescriptionLength` budgets 6 chars for them), but `/\\(.)/gs` strips the backslash from `\u`, turning `description: "foo\u001fbar"` into `description: "foou001fbar"`.
   - **Fix**: Prefer `JSON.parse(trimmed)` (falling back to the single-pass regex only on non-JSON YAML escapes) or handle `\\u([0-9a-fA-F]{4})` before `\\(.)`.

4. **[Minor]** `libs/backend/agent-generation/src/lib/services/orchestrator.service.spec.ts:773-786` — Stale test description.
   - The test title reads `it('does not split a single overlong word', ...)` while line 785 now asserts hard-capping `'A'.repeat(201)` to `'A'.repeat(200)`.
   - **Fix**: Rename the test title to reflect the updated behavior (e.g., `'hard-caps a single overlong token at 200 chars instead of emitting empty'`).

## Checks run

- **Node test (`scripts/regen-agents.spec.mjs`)**:
  `node --test scripts/regen-agents.spec.mjs` -> **7 passed, 0 failed** (exit 0).
- **Jest (`libs/backend/agent-generation`)**:
  `node D:\projects\PtahCode\node_modules\jest\bin\jest.js --config libs/backend/agent-generation/jest.config.ts --runTestsByPath libs/backend/agent-generation/src/lib/services/orchestrator.service.spec.ts libs/backend/agent-generation/src/lib/services/template-storage.service.spec.ts libs/backend/agent-generation/src/lib/services/agent-recommendation.service.spec.ts --runInBand --coverage=false --no-watchman` -> **3 suites passed, 144 tests passed, 0 failed** (exit 0).
- **TypeScript (`libs/backend/agent-generation`)**:
  `node D:\projects\PtahCode\node_modules\typescript\bin\tsc --noEmit -p libs/backend/agent-generation/tsconfig.lib.json` -> **passed** (exit 0).
  *(Note: `ptah_get_diagnostics` timed out at 45s while initializing the workspace TS check; direct scoped `tsc --noEmit` verified the library cleanly.)*
- **ESLint**:
  - `node D:\projects\PtahCode\node_modules\eslint\bin\eslint.js scripts/regen-agents.mjs scripts/regen-agents.spec.mjs` -> **passed** (0 errors, 0 warnings, exit 0).
  - `node D:\projects\PtahCode\node_modules\eslint\bin\eslint.js libs/backend/agent-generation/src/lib/services/orchestrator.service.ts libs/backend/agent-generation/src/lib/services/orchestrator.service.spec.ts --quiet` -> **passed** (0 errors, exit 0).
- **Dry-run & corpus verification**:
  - `node scripts/regen-agents.mjs` (dry-run without `--write`) -> **exit 0** (`WOULD CHANGE 28` OpenCode/Codex targets, 0 errors).
  - Direct `capDescription` verification across all 14 `.claude/agents/*.md` files -> **14/14** unchanged (`same=true`), valid JSON/YAML double-quoted scalars, serialized lengths `136`–`191` chars (all `<= 200`).
  - `git diff --check -- libs/backend/agent-generation/src/lib/services/orchestrator.service.ts libs/backend/agent-generation/src/lib/services/orchestrator.service.spec.ts scripts/regen-agents.mjs scripts/regen-agents.spec.mjs` -> **passed** (exit 0).
- **Remaining uncertainty**: Runtime downloaded templates under `~/.ptah/templates/agents/` are not stored in this repository and were not exercised live; pre-existing lone UTF-16 surrogates in malformed inputs (`'\uD800'`) expand to 6 chars under `JSON.stringify` (`\ud800`) rather than 1.
