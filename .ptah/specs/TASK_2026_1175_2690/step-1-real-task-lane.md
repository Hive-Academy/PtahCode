# Retired role routing regression

- Spec added: `libs/backend/lane-routing/src/lib/pipeline/phase-plan.spec.ts:53`.
- Existing case already covers listed retired roles. The new case covers unlisted `backend-developer`, `Frontend-Developer`, and ` devops-engineer `. Each must yield `subagent:tests` for a `tests` phase. It also checks that listed active `code-logic-reviewer` yields its explicit role candidate.
- Jest: passed, 1 suite and 17 tests. Command: `npx jest --config libs/backend/lane-routing/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/lane-routing/src/lib/pipeline/phase-plan.spec.ts`.
- ESLint: passed. Command: `npx eslint libs/backend/lane-routing/src/lib/pipeline/phase-plan.spec.ts`.
- Bug found: none.
