# Wave 1 visual compare after extraction and adoption (V1 + V2, decision D9)

Verdict: PASS. 18 of 18 states show 0 changed pixels (`maxDiffPixels: 0`, `threshold: 0`).

Post-edit build: `npx nx copy-renderer-dev ptah-electron` on commit-equivalent tree of `7a5145275`
(before `origin/main` was merged, so the compare isolates the task diff). The task changes no
main-process code, so `dist/apps/ptah-electron` main, preload and workers stay from the baseline build.
Baseline: `visual-baseline-recapture.md`.

| State | Kind | Themes | Changed px |
| ----- | ---- | ------ | ---------- |
| analyze-ready | source (setup action) | dark glass, dark solid, light glass, light solid | 0 |
| ready-workspace | source (setup field, setup action) | dark glass, light glass | 0 |
| chat-rail-expanded | source (rail icon action) | dark glass, light glass | 0 |
| chat-rail-hover | source | dark glass, light glass | 0 |
| chat-rail-focus | source | dark glass, light glass | 0 |
| chat-rail-collapsed | source | dark glass, light glass | 0 |
| machines-add-before | consumer (A1) | dark glass, light glass | 0 |
| review-settings-before | consumer (A1) | dark glass, light glass | 0 |

## Runs

| Run | Result |
| --- | ------ |
| Full compare, post-edit | onboarding passed, consumer surfaces passed. Chat rail failed: the app showed the Settings view at the dark focus step (no pixel result, see the unstable point in the recapture document) |
| `-g "chat canvas rail" --retries=3`, post-edit | passed on the first attempt, 8 states 0 px |

Not covered: the generation model picker select (`[ptahSetupField]` default look) has no captured
state; its class list is covered by the directive spec and the code review.
