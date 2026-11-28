# Shared command output cards

## Grammar and public contract

`leaderboard [title]` and `meter [title]` compile to one component each in `dashboard-catalog/4`. The parser uses the existing text and cell escapes. The schemas validate the same limits and reject unknown icons.

```ptah-ui
leaderboard Top contributors
  group skill Skills
  - Build \| test | 21
  group server MCP servers
  - workspace | 14 | 320 requests | Project
meter Context capacity
  System prompt | 11800 | 11.8k
  Free space | 921500 | 921.5k | muted
```

- **Leaderboard.** Entry cells are `label | share | value | detail`. Share is 0–100 and drives the absolute bar width. Display an omitted value as `${share}%`. Entries before the first `group <icon> <title>` header form an implicit untitled group. Each group has at least one entry, ranks restart at 1, and there are up to 50 entries total and eight groups including the implicit group.
- **Meter.** Segment cells are `label | amount | value | muted`. Amount is a finite nonnegative number. Value defaults to amount. Up to 12 segments share the width according to their amount divided by the sum. For an all-zero meter, render all widths as zero. A frontend implementation can scale amounts by the largest amount before summing to keep proportions finite for very large inputs.
- **Icon tokens.** `skill`, `agent`, `server`, `tool`, `file`, `memory`, `chart`, `clock`, `bolt`, `info`, `terminal`, `folder`, `cpu`, `gauge`, `user`, `sparkles`.

Import component props and tokens from the Zod-free `@ptah-extension/shared` entry point.

```ts
import {
  SURFACE_ICON_TOKENS,
  type SurfaceIconToken,
  type SurfaceLeaderboardComponent,
  type SurfaceLeaderboardEntry,
  type SurfaceLeaderboardGroup,
  type SurfaceLeaderboardProps,
  type SurfaceMeterComponent,
  type SurfaceMeterProps,
  type SurfaceMeterSegment,
} from '@ptah-extension/shared';
```

The component interfaces extend their props with `kind` and `id`. The existing `@ptah-extension/shared/mcp-apps-contracts/surface` entry point also exposes the types and token list. Validation stays under the `@ptah-extension/shared/mcp-apps-contracts` package subpaths.

## Rendered fixture output

These fences are the output of `formatLocalCommandOutput` for the shared fixtures. The formatter checks the fence limits and compiles the body before returning it. Inputs that exceed budgets or fail compilation keep their original stdout.

### /usage

```ptah-ui
title Claude usage
grid 2
  card all models
    progress Current week | 3 | ok
    badge neutral resets Dec 5, 5am (Africa/Cairo)
  card Fable
    progress Current week | 4 | ok
    badge neutral resets Dec 5, 5am (Africa/Cairo)
section Last 24h
  stats
    Requests | 427
    Sessions | 15
  leaderboard Contributors (% of usage)
    - Run fewer sessions at once | 45
    - Start fresh when you switch tasks | 38
    - See what fills your context | 32
    - Run /session-handoff on a cheaper model | 21
    - Turn off ptah when you don't need it | 21
  leaderboard Top contributors
    group skill skills
    - /session-handoff | 21
    - /agent-lanes | 5
    - /ptah-surface-authoring | 1
    - /orchestration | 1
    group server MCP servers
    - ptah | 21
section Last 7d
  stats
    Requests | 18780
    Sessions | 63
  leaderboard Contributors (% of usage)
    - Review sessions active over many hours | 93
    - Start fresh when you switch tasks | 72
    - Check which model "backend-developer" subagents… | 40
  leaderboard Top contributors
    group skill skills
    - /session-handoff | 1
    group agent subagents
    - backend-developer | 40
    - frontend-developer | 14
    - software-architect | 5
    - general-purpose | 4
    - code-logic-reviewer | 3
    - visual-reviewer | 1
    - fork | 1
    - orchestration | 1
    group server MCP servers
    - ptah | 2
  note info +3 more
note info You are currently using your subscription to power your Claude Code usage
note info Approximate · sessions on this machine only · shares overlap
```

### /context

```ptah-ui
title Context usage
stats
  Model | claude-fable-5-2
  Used | 45.5k / 1m
  Used % | 5%
  Free | 921.5k
progress Context window | 5 | ok
meter Estimated usage by category
  System prompt | 11800 | 11.8k
  System tools | 11600 | 11.6k
  MCP tools | 9700 | 9.7k
  MCP server instructions | 227 | 227
  MCP tools (deferred) | 26000 | 26k
  System tools (deferred) | 12800 | 12.8k
  Custom agents | 2600 | 2.6k
  Memory files | 5500 | 5.5k
  Skills | 3500 | 3.5k
  Messages | 648 | 648
  Free space | 921500 | 921.5k | muted
  Autocompact buffer | 33000 | 33k | muted
accordion MCP tools (7)
  leaderboard
    - ptah_agent_spawn | 39.9 | 3.4k | ptah
    - ptah_session_start | 22.3 | 1.9k | ptah
    - ptah_route_decide | 16.4 | 1.4k | ptah
    - ptah_grep | 10.5 | 895 | ptah
    - execute_code | 6.9 | 590 | ptah
    - approval_prompt | 2.6 | 218 | ptah
    - ptah_workspace_analyze | 1.4 | 121 | ptah
accordion Custom agents (3)
  leaderboard
    - software-architect | 38.7 | 239 | Project
    - code-logic-reviewer | 32.3 | 199 | Project
    - backend-developer | 29 | 179 | Project
accordion Memory files (2)
  table
    Type | Tokens
    Project | 5.2k
    User | 332
accordion Skills (4)
  leaderboard
    - dataviz | 41 | ~480 | Built-in
    - claude-api | 33.3 | ~390 | Built-in
    - angular-developer | 13.7 | ~160 | Project
    - agent-lanes | 12 | ~140 | Project
```

## Part 2 notes

- The shared converter emits titleless table and list components. The visible title defaults come from `dashboard-table.component.ts:105` and `dashboard-list.component.ts:91`. Keep the accessible labels when removing the defaults from the visible headings.
- Leaderboard and meter titles, group titles, labels, values and details are plain strings. Resolve group icons through the fixed `SurfaceIconToken` to Lucide map. Add both display kinds to the renderer's catalog/4 validation and view-model mapping.
- Context detail bars use token shares within their own section, including entries beyond the visible eight. Details carry the provider source or MCP server. The usage renderer keeps up to eight rows per top group and six top groups per window, with a note for omitted items.
- Verification covered the shared contract and both renderer fixtures. Electron visual verification belongs to part 2 and was outside this lane's scope.

## Files changed

- Grammar reference at `.claude/skills/ptah-surface-authoring/references/ptah-ui.md`.
- Public exports in `libs/shared/src/index.ts` and `libs/shared/src/mcp-apps-contracts/surface.index.ts`.
- Parser and converter in `ptah-ui-parser.ts`, `ptah-ui.types.ts` and `ptah-ui-converter.ts` under `libs/shared/src/mcp-apps-contracts`.
- Surface catalog, validation, selection and text fallback in `surface-catalog.ts`, `surface.types.ts`, `surface.schemas.ts`, `surface-selection.ts` and `surface-text-fallback.ts` in the same directory.
- Command renderers in `libs/shared/src/lib/local-command/context-output.render.ts` and `usage-output.render.ts`.
- Specs in `ptah-ui-parser.spec.ts`, `ptah-ui-converter.spec.ts`, `surface-validator.spec.ts` and `local-command-output.spec.ts`.
- This handoff at `.ptah/specs/TASK_2026_2336_7019/visual-upgrade-part1-shared.md`.

## Verification

- Focused Jest passed all 638 tests across 10 suites, including both command fixture compiles, the parser and converter, surface validation, catalog budgets, the dashboard trust boundary, the text fallback, the pipeline, public surface exports and the Zod-free root spec. Node emitted an ES-module loading warning for the Jest config and the run completed successfully.
- ESLint on the 16 changed shared TypeScript files exited successfully with zero errors. Two existing warnings remain. The command spec contains a non-null assertion and the surface schema file exceeds the line limit.
- The Ptah dependency index did not cover the shared type file. Workspace source search supplied the fallback for direct consumers. No Electron session was launched for this shared-only lane.
