# Clear the degradation audit with one logging and error-handling standard

## Problem

`tools/degradation-audit/check-degradation.ts` flags failure sites that are swallowed
silently. On `main` (fade48e81) it reports 223 unsuppressed sites in 36 directories:

| Kind | Count |
|---|---:|
| catch-return-sentinel (a catch returns a literal without logging or rethrowing) | 198 |
| promise-catch-sentinel (a `.catch()` handler returns a literal or is empty) | 22 |
| orphaned-suppression (an annotation that no longer attaches to a site) | 2 |
| floating-promise (an un-awaited async call) | 1 |

The baseline (`tools/degradation-audit/baseline.json`) only stops the count from rising.

## Plan

1. Design: write `logging-error-handling-standard.md` in this folder from the logging
   and error mechanisms the codebase already has.
2. Fix: five file-disjoint lanes apply the standard to every site. Each lane is reviewed.
   Site list per lane: `.ptah/tmp/degradation-sites.json` (generated from the audit run).
3. Gate: audit total 0 (or each remaining site annotated with an honest reason), baseline
   lowered with `--update-baseline`, scoped verify on every changed project.

| Lane | Directories | Sites |
|---|---|---:|
| backend-core | apps/ptah-electron, platform-core, platform-cli, platform-electron, persistence-sqlite, settings-core, shared, agent-sdk, cli-agent-runtime, rpc-handlers, workspace-intelligence | 38 |
| backend-providers | auth-providers, cli-engine, cron-scheduler, gateway-chat-bridge, messaging-gateway | 48 |
| backend-features | harness-sync, memory-curator, output-styles, plugin-marketplace, skill-synthesis, task-specs, voice-providers, vscode-lm-tools | 52 |
| frontend-chat | chat, chat-state, chat-streaming, chat-ui | 29 |
| frontend-features | the other frontend libs | 56 |

## Keeping up with main

Others merge into `main` while this runs. Before the PR: merge the latest `origin/main`
into this branch, re-run the audit, and fix any site that newly merged code added, so
the baseline update covers everything on `main`. Repeat before merging if `main` moved.
