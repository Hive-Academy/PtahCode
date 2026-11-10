## Changes

- `provider-auth-resolver.ts`: a known live catalog can displace a missing static tier id when a derived tier exists. Explicit overrides remain first. Comparison strips one trailing bracket suffix. Replacement logging is once per provider and tier per process. Capability env receives the resolved ids.
- `provider-auth-resolver.spec.ts`: added override, absent catalog, suffix match, replacement/log/capability, and missing derived tier cases.
- `provider-models.service.spec.ts`: verified the existing `getCachedModelIds` distinguishes static fallback from persisted live data. No service source change was needed because its existing accessor supplies the required synchronous live-only ids.

## Decisions

- **Use existing accessor.** Options: add a new method or use `getCachedModelIds`. Evidence: `provider-models.service.ts:747-750,786-792` reads dynamic cache then persisted live data; the static fallback at `:434-448` does not populate it. Reversible: yes.
- **Exempt filtered provider catalogs from absence replacement.** Options: preserve the raw upstream id set or exempt the provider. The current service does not retain the raw set, so exemption avoids treating a hidden but available id as retired. Reversible: yes, when raw ids are retained.
  - OpenAI Codex: exempt. `codex-home-auth.service.ts:491-492` retains only `visibility === 'list'`; registry default at `codex-provider-entry.ts:46`.
  - GitHub Copilot: exempt. `copilot-auth.service.ts:654-659` filters picker-disabled and non-tool-call models; registry default at `copilot-provider-entry.ts:114`.
  - OpenCode Zen and Go: exempt. `provider-models.service.ts:300-325` uses routable ids only; registry defaults at `opencode-provider-entry.ts:122,147`. This branch currently does not populate the live cache, but the exemption covers a future cache path.
  - Ollama and Ollama Cloud: apply the rule. Registered discovery fetchers at `local-native.strategy.ts:150-157,219-220`; defaults at `local-provider-entry.ts:84,133`; service caches their returned list at `provider-models.service.ts:348-362`, before its optional tool-use filter at `:364-366`. No catalog filter is applied at that cache boundary. Reversible: yes.
  - Sakana: apply the rule. Its endpoint and default are at `sakana-provider-entry.ts:86-87`; endpoint models enter cache at `provider-models.service.ts:524-527`, before optional tool-use filtering at `:537-539`. Reversible: yes.
  - Z.AI: apply the rule. Endpoint and defaults are at `provider-registry.ts:225-241`; endpoint models enter cache at `provider-models.service.ts:524-527`, before optional tool-use filtering at `:537-539`. Reversible: yes.
  - Other registry-default providers (Claude CLI, Kimi Code): apply the rule if a genuine dynamic or persisted catalog is known. `provider-models.service.ts:747-750` prevents a static fallback list from qualifying; no filtered production fetcher was identified. Reversible: yes.

## Verification

- `npx prettier --check` passed for `provider-auth-resolver.ts` before spec formatting. The two specs were formatted with Prettier.
- `ptah_get_diagnostics` was attempted twice on the changed files; its TypeScript worker timed out, so it gave no result.
- Required command: `npm run verify -- -p @ptah-extension/auth-providers 2>&1 | Select-Object -Last 80` (single foreground run). Result: exit 1 after waiting 2021 seconds for a slot.
- Lint/typecheck target group: 2 succeeded, 0 failed (`@ptah-extension/auth-providers:lint` and `:typecheck`). Test target: 0 succeeded, 1 failed (`@ptah-extension/auth-providers:test`). Jest: 89 suites passed, 2 failed, 1 skipped; 2664 tests passed, 6 failed, 10 skipped; 2 snapshots passed.
- Failed suites: `src/lib/providers/codex/codex-account-usage.service.spec.ts` (2 assertions), `src/lib/auth/draft-verification.service.spec.ts` (4 assertions). The resolver and model service specs were not failed suites.
- Last result lines: `NX 1 task: 0 succeeded, 1 failed`; `✖ nx run @ptah-extension/auth-providers:test`; `Run duration: 5m 54s`; `[verify 2026-11-10T00:20:01.092Z] lock released after 496.3s, exit code 1`.

## Extra reads

- Named resolver/service source and their existing specs; registry entries for default-bearing providers; Codex/Copilot filter points and local discovery registrations for filtered-list risk.

## Open items

- `codex-account-usage.service.spec.ts`: “keeps live updates for two homes and owners separate” expected owner key `openai-codex#account:dfad20dc92bcaf1a`, received `openai-codex#account:f69bfe480386cf85`.
- `codex-account-usage.service.spec.ts`: “delivers fresh evidence from the first read on a cold cache” expected the synthetic home path with uppercase `D:`, received lowercase `d:`.
- `draft-verification.service.spec.ts`: four stored-credential cases failed. First assertion: `harness.execute` expected 1 call, received 0. The remaining three received `undefined` for `probeAuth` when expecting serialized credentials (Kimi and two local endpoints). This suite was outside this batch's write set.
- The known `plan-usage.service.spec.ts` failure did not occur in this run. No changes were made to Codex, draft verification, or plan usage files.
