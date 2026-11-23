# Batches — TASK_2026_2310_rvlns

Source: `implementation-plan.md` batch table (revision 1, Gate 2 approved, D15). Detail per batch is in the plan's
component sections C1-C14; each executor reads only its batch's components.

| Batch | Scope (plan components) | Executor | Depends on | Status | Commit |
|---|---|---|---|---|---|
| B1 | Contracts, additive (C1 B1 files) | backend-developer | - | COMPLETE | e3c7dc142 |
| B2 | Lane store + selection blocks (C3, C5-B2) | backend-developer | B1 | COMPLETE | 0e492bbe8 |
| B3 | Runner, stages, persistence, Electron gateway (C4, C5-B3, C6, C7, C8) | backend-developer | B2 | COMPLETE | (B3 commit) |
| B4 | RPC surface + rpc-surface specs (C1-B4, C2, C9) | backend-developer | B2, B3 | IN PROGRESS | |
| B5 | Renderer store (C10) | frontend-developer | B4 | PENDING | |
| B6 | Review lanes section components (C11, C12) | frontend-developer | B1 | COMPLETE | f0b779714 |
| B7 | Run detail + D14 badge (C14) | frontend-developer | B1 | COMPLETE | 213cfc8cf |
| B8 | Drawer shell on ptah-native-drawer (C13) | frontend-developer | B5, B6 | PENDING | |

Verify commands and acceptance criteria per batch: plan table, `implementation-plan.md:719-726`.
