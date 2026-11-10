# Code review: Ptah CLI lane provider mark

Reviewer: Claude Api Ptah CLI lane (read-only). Verdict: **approve**.

- No missed surface renders a mark for a Ptah CLI lane. The orchestrator avatar needs no change.
- Every mapped mark id resolves in `PROVIDER_BRAND_SLUGS`. The `ptah-cli` fallback is in `PROVIDER_MARKS`.
- System CLI lanes are unchanged: the provider applies only when `cliId === 'ptah-cli'`.
- Angular rules hold: signal inputs, `computed`, OnPush, no `any`, `Object.hasOwn` guards.
- Restore path: `restoreQuotaOwner` keeps `providerId` through `...rest`. `agent-events.ts` writes it.

Minor notes:
- In the Settings lane list, an unmapped provider (for example `requesty`) now shows the `P` mark instead of the Terminal icon. This is the requested fallback.
- The avatar spec was tidied for readability after the review.
- No test covers `ref.providerId` in the restore path of the monitor store (accepted gap).
