# Plan revision notes — round 1

| Finding | Disposition and code evidence | Plan change |
|---|---|---|
| B1 | Accepted. Owner live key is `${runToken}#${turn}` at `session-stats-owner.service.ts:1305`, unlike replay message key. | Contracts; billable predicate, coverage columns and B1. |
| B2 | Accepted. Lane ID/key at `lane-completion-outcome.ts:145-149`; rollout reader exists at `codex-rollout-usage.reader.ts:57-70`; non-default home at auth `:22-25`. | Contracts; Codex ownership, source registry and B7b. |
| B3 | Accepted. Repository sums every row at `session-stats-repository.ts:190-200`. | `billable` column, filtered totals SQL; no-live historical replay explicitly billable. |
| B4 | Accepted. `auth-providers` imports `agent-sdk` at `claude-account-command.ts:4`; `ProviderAccountStore.list()` at `:188-190`. | Read-only `auth-providers-tokens` port and B7; no reverse import. |
| S5 | Accepted. `persistence-sqlite` is util; lint boundary `eslint.config.mjs:390-391`. | B6 registers cursor only; B8 scheduler in `usage-analytics`, B9 host binding. |
| S6 | Accepted. Token/public exports absent from previous write sets. | B7/B7a/B7b/B8 list token and index files; contract locations explicit. |
| S7 | Accepted. File port has existing bounded method at `:74`; mock/contract at `:167/:95`. | B6a optional range method plus mock/contract; B6 cursor split. |
| S8 | Accepted. Electron phase 1 store at `:167` precedes phase 2 registration at `phase-2-libraries.ts:244,350`. | B9 starts after phase 2, deferred until ready. |
| S9 | Accepted. Owner finalization at `:460-466`; manager terminal release at `:3647-3666`; live queue at sink `:53`. | Trigger port and B1/B2 emitters; B8 direct cursor transaction. |
| M10 | Accepted. Repo source enum `:23`, producer-scoped delete `:139-149`, sums `:190-198`. | Source enum mapping, nullable sentinel mapping and PK upsert in Contracts. |
| M11 | Accepted. Coverage stamps `Date.now()` at `session-stats-repository.ts:231-236`. | Historical MIN/MAX event time in SQL and B6 tests. |
| M12 | Accepted. In-flight retry uses old live key; owner `:1305`. | S0005 preserves unprefixed keys; migration before producers; B1 test. |
| M13 | Accepted. Git helper `repository-identity.ts:141-189` is not public; util cannot import feature. | Feature resolver/host injection, B10 historical backfill and B9 composition. |
| M14 | Accepted. ptah-cli stream usage `:639-673`; manager `onSegment` `:1487-1503` was not proven end-to-end. | B5 explicit handle-to-outcome integration assertion. |
| m15 | Accepted as guidance. No template write in B11. | Rule R retained; B11 existing view-model test and verify command. |
| m16 | Accepted. Rollout reader already traverses date partitions at `:81-94`. | Performance says no recursive `readDirectory`, newest-first Codex discovery. |
