# Context — TASK_2026_2288_acp1

## User request (2026-11-20)

> start a workflow for looking at t3code i do like there unified acp adapters across all
> providers and i think we should rely on it and rather we spawn cli, to have full control
> over its harness ? similairly i want to check how they talk to grok through acp as well,
> so we are able to make our main agent go through those providers as well, planning to also
> change opencode to the same adapter workflow whether through acp or opencode sdk, so its
> unified across everything

## Prior finding

No existing spec plans first-class Antigravity via ACP/SDK. Antigravity today is a CLI lane
(`agy --print` stream-json, TASK_2026_199). Grok already uses `cli-adapters/acp/`.

## Reference

t3code (pingdotgg/t3code) shallow clone at commit 9294a9801e80, read-only, outside the repo.

## User follow-up (2026-11-20) — scope expanded to implementation, full auto

> one important caveat that we need it to be adaptable to our current setup so eventually we
> need to be able to use those as main providers and also as cli tool and have the same exact
> setup we made so far for claude agent sdk and codex app server , also go in full automode to
> get that working and make sure you test everything in our dev server and choose best solution
> thats inspired by our code that we already have

Decisions this implies:
- Each new provider (Antigravity, Grok, OpenCode) must work both as a main-agent provider and as
  a CLI lane, mirroring the existing Claude Agent SDK and Codex App Server setup exactly.
- Design follows Ptah's existing patterns first; t3code is inspiration, not a template.
- Full auto: no checkpoints; verify in the Electron dev app (user authorized running dev).

## Runtime pre-flight (2026-11-20, this machine)

- agy 1.5.13 installed; `agy acp` exists (flags include --app-data-dir, --add-dir, --agent,
  --dangerously-skip-permissions, --cli_log_file).
- codex-cli 0.171.0, Claude Code 2.1.329 installed.
- grok: NOT installed (not on PATH, no ~/.grok). Live Grok testing needs the CLI and xAI auth.
- opencode: NOT installed. Live OpenCode testing needs the CLI (npm `opencode-ai`).

## Program table

| Phase | Task ID | Pull request | State |
|---|---|---|---|
| Research + plan | TASK_2026_2288_acp1 | #1443 | done |
| P1 contracts + acp-runtime extraction | TASK_2026_2289_p1 | #1444 | done |
| P2 acp-runtime hardening | TASK_2026_2290_p2 | #1445 | done |
| P3 Antigravity ACP lane (P3x not needed, D9 passed) | TASK_2026_2291_p3 | #1451 | done |
| P4 chat foundation A | TASK_2026_2292_p4 | #1450 | done |
| P5 chat foundation B | TASK_2026_2294_p5 | #1453 | done |
| P6 chat foundation C | TASK_2026_2295_p6 | #1456 | done |
| Side: onboarding main-connection step | TASK_2026_2293_onboard | #1452 | done |
| P7 chat backend (adapter, host ports, pool) | TASK_2026_2296_p7 | #1458 | done |
| P8 + P9 Electron composition, Antigravity main chat | TASK_2026_2297_agy | #1462 | in_review |
| Side: Antigravity follow-ups | TASK_2026_2301_agyfu | — | backlog |
| Side: agy analytics and repricing (issue 1459) | TASK_2026_2302_usage | — | backlog |
| P10 Grok main chat | TASK_2026_2305_p10 | — | backlog (live-unverified) |
| P11a–c OpenCode | TASK_2026_2299_p11 | — | backlog, blocked on PF-6 (CLI not installed) |
| P12 consolidation | TASK_2026_2300_p12 | — | backlog (removals need user approval) |
