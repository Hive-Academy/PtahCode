# Batch B1 report

## Files changed

- `libs/shared/src/lib/types/phase-contract.types.ts`: added the V1 contract and 12 ordered kinds.
- `libs/shared/src/index.ts`: exported the new contract.
- `libs/shared/src/index.zod-free.spec.ts`: added the contract to the Zod-free guard.
- `.ptah/specs/TASK_2026_1009_f898/batch-B1-report.md`: this report.

## Exported types

`PHASE_CONTRACT_VERSION = 1 as const`; `PHASE_KINDS` is the existing ten kinds in their original order, followed by `batch` and `completion`; `PhaseKind = (typeof PHASE_KINDS)[number]`.

```ts
export interface PhaseDefinitionV1 {
  readonly version: 1;
  readonly kind: PhaseKind;
  readonly input: readonly string[];
  readonly deliverable: readonly string[];
  readonly verdict: readonly string[];
  readonly acceptanceStep: readonly string[];
  readonly requiredCapabilities: readonly string[];
  readonly toolProfile: {
    readonly disallowedTools: readonly string[];
    readonly permission: 'allow' | 'deny' | 'prompt';
  };
  readonly discipline: {
    readonly method: string;
    readonly outputContract: string;
    readonly returnValue: string;
    readonly refusals: string;
    readonly escalationProtocol: string;
    readonly reviewerStance?: string;
  };
}
```

## Verification

- `npm run verify -- -p @ptah-extension/shared | tail -25` — exit 0; summary: `NX 1 task: 1 succeeded` for the test stage; verify released its lock with exit code 0.
- `npx ts-node --transpile-only tools/role-census/check-role-census.ts | tail -25` — exit 0; summary: `TOTAL: 2080 lines in 298 files`.
- Scoped TypeScript diagnostics for the three changed shared files: 0 errors, 0 warnings.

## Files read outside read set

- `.ptah/specs/TASK_2026_1009_f898/implementation-plan.md` (required design and B1 row).
- `libs/backend/lane-routing/src/lib/contracts/route-decide-args.schema.ts` (kind order).
- `libs/shared/src/index.ts` (export collision check and edit location).
- `libs/shared/src/lib/types/phase-contract.types.ts` (review of newly written contract).

## Decisions

| Decision | Options | Evidence |
| --- | --- | --- |
| Keep `task-spec.contract.ts` unchanged. | Change the carrier version or add a document constant; keep the current carrier contract. | The design explicitly keeps the carrier version at 1 and requires no new document constant. |
| Keep the tool profile inline in `PhaseDefinitionV1`. | Add a separate alias; use the exact nested shape from the design. | The design specifies `disallowedTools` and the three-value `permission` field as an inline readonly object. |
| Add the new module to the existing Zod-free guard. | Rely on inspection; include it in the guard. | The guard walks relative imports from each listed module; the new module has no imports. |

No matching shared-contract skill invocation was available through this CLI's skill mechanism; tool availability was checked before work.

