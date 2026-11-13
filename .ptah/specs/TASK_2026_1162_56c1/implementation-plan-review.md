# Implementation plan review — Phase 3: Setup skills by tech stack

## Verdict: REVISE

The plan has a useful order, but it does not cover the full setup flow in the context. Fix the five findings below before assigning batches.

## Top 5 findings

1. **The required NestJS result conflicts with the relevance rule.** No `@nestjs/*` dependency appears in this workspace's package manifests. The existing `skillsSh:detectRecommended` code detects NestJS from `@nestjs/core`. A test that requires NestJS here would reward a false positive. Define another valid proof source, or remove NestJS from this workspace's expected selection.
2. **The skill install flow has no owner.** The context requires preview, submit, retry, browse, install, provider propagation, and Markdown rewriting. B1–B5 cover recommendation, search, cards, and consent, but do not assign these install paths or their tests. Add a batch for the full skill selection to installation flow and name the existing `skillsSh:install` and harness sync interfaces it will use.
3. **B1 cannot add usable RPC methods in one listed file.** New method names need request and response types, method registry entries, handler tests, and caller updates. The plan lists only `setup-rpc.handlers.ts`. Add the shared RPC contract and registration files to B1, and define the payloads before B4 starts.
4. **Consent has no server side enforcement point.** B4 adds a checkbox; B5 says to record consent and lists a test file, but neither batch names the code that must block installation before a script runs. Define how script content is detected, where consent is stored, how it is bound to a skill version, and which install entry points enforce it. Test both refusal and approved install.
5. **B4 and B5 are too large and too late in the dependency chain.** B4 asks one lane to replace steps and cards, add guidance, add consent, and keep cancel behavior across frontend and webview. B5 then connects the services needed to make that UI work. Split B4 by flow, connect each service before its UI work, and include the onboarding caller at `libs/frontend/onboarding/src/lib/analyze/analysis-step.store.ts`.

## 1. Plan clarity

The six batch headings state an intended order, but the deliverables are uneven. B1 calls its methods “stubs” without defining whether they return real recommendations. B3 does not define a weak practice, evidence shape, or the meaning of the three labels. B4 gives directory names instead of exact component and test files. B5 repeats relevance gate work already assigned to B2.

The order B1 → B2 → B3 → B4 → B5 → B6 is explicit. The interface dependencies are not. B1 needs shared RPC types and the existing skills.sh contract. B4 needs the B2 and B3 payloads. B5 changes B1's handlers and is required before the B4 flow can pass. State these dependencies as deliverables. State Phase 1 as a start condition, and check the claimed lack of Phase 2 file overlap against an explicit file list.

## 2. Feasibility

The batches cannot run independently from a clean branch. They can run as separate lane runs only after their named inputs land. B2 and B3 could run in parallel after their service contracts are fixed; both edit `agent-generation` DI files, so assign one owner for the shared registration edit or sequence that edit. B4 needs usable backend responses. B6 needs an integrated flow.

B1 may fit about 20 minutes only if it is limited to contracts and a thin adapter with focused tests. B2 and B3 may fit if their detection rules and payloads are specified first. B4 is not credible in 20 minutes. B5 is also large because it combines wiring, consent persistence, and repository integration. B6's visual review may exceed 20 minutes if it includes setting up Electron and a weak repository fixture. State a repeatable way to inspect the Electron UI without invoking forbidden build, serve, dev, e2e, or package targets.

## 3. Batch decomposition

Keep separate service batches for skill selection and project guidance, but specify their contracts. Merge the duplicate relevance gate wording into B2; B5 should test that the RPC applies the same gate. Split B4 into skill selection UI, guidance decision UI, and install consent UI, with each batch tied to a working backend contract. Move backend wiring before its UI batch. Add a dedicated install and propagation batch. B6 should review the completed flow and collect screenshots, with a small fixture for weak repository behavior.

For each batch, list exact owned files and tests. Include `libs/shared/src/lib/types/rpc.types.ts`, the RPC method registry, `libs/frontend/setup-wizard/src/lib/services/wizard-rpc.service.ts`, and the onboarding store where relevant. Keep old agent RPC callable through Phase 5, as the context requires.

## 4. Risk assessment

**Highest risk: false recommendations.** The plan says dependencies must prove technology, but its NestJS acceptance example has no matching manifest dependency. Tests need positive and negative evidence, including ambiguous names and missing manifests. The existing skills.sh detector checks the root `package.json`; the plan must state whether nested project manifests count.

**High risk: unapproved script execution.** A checkbox and a stored flag do not prove that every install path enforces consent. Check scripts before installation, bind approval to the reviewed skill content or version, and reject direct RPC installs without valid consent. The existing `skill-sync-gate.spec.ts` concerns propagation selection, so it is not by itself an install consent test.

**High risk: incomplete migration.** Existing preview, submit, retry, and pack RPC methods and the onboarding caller remain in the code. “No agent-related UI shown” is not enough to prove the skill install flow works. Test the old callable path and the new user path separately.

**Medium risk: weak guidance from invented facts.** “Start with simple rules” or mock data is not an adequate production control. Each fact needs source evidence, a label, and an owner decision. If evidence is missing, return “cannot verify” and a baseline task proposal, as the context requires.

**Medium risk: regressions in shared hosts.** Electron screenshot review is needed, but shared RPC and frontend changes also need scoped checks for changed projects and affected Electron and renderer code. Do not rely on a screenshot to verify backend behavior.

## 5. Acceptance criteria

Most criteria are testable in principle, but they need exact inputs and outcomes. B1 should assert typed RPC registration, search error behavior, and unchanged old agent calls. B2 should use dependency fixtures and assert rank, evidence, and one skill per subject. B3 should use a weak repository fixture and assert labeled facts, owner choice, debt record, and “cannot verify” when facts are missing. B4 should assert step navigation, cancel, loading/error states, and consent display for a script bearing skill. B5 should assert the server refuses a script bearing install without consent and records approved consent. B6 should save Electron screenshots for normal and weak repository flows and compare them with the intended step order.

Implementers should run scoped `npm run verify -- -p <projects>` for changed projects, one heavy check at a time. After **each** batch, run `npx ts-node --transpile-only tools/role-census/check-role-census.ts` and require exit 0 with no increases, then run `npm run validate-skill` and require zero errors. After any template change, run `npm run verify -- -t typecheck-templates -p ptah-extension-webview`. Wrap other heavy commands with `node scripts/verify.mjs --exec --task <name> -- <command>`. B4's template check alone is not enough for its changed frontend and renderer code. No verification commands were run for this review.

## 6. Decisions

The four “Decisions needed” questions identify topics, but do not state options, owners, or decision deadlines. The first asks whether to use skills.sh or mock data even though the context already requires `skillsSh:detectRecommended` and `skillsSh:search`. Use the real APIs; use fixtures only in tests. The project guidance source and weak practice rules need a defined evidence schema before B3. The UI question in the context should resolve to a decision step when owner choice is required; routine facts can appear inline. File ownership is an assignment issue, not a product decision; name the B4 owner and file list in the revised plan.

I assume Phase 1 must be present before B1 starts, Phase 2 remains parallel only after its file overlap is checked, and agent generation RPC remains callable through Phase 5. I assume skill installation uses the existing `skillsSh:install` path and harness sync unless an explicit interface change is justified. I do not assume that a technology is present from its name in source text alone.
