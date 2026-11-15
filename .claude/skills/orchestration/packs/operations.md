# Pack: operations

## Discipline
Operations work changes the configuration, the process or the environment of a system. It follows a planned sequence of changes. Each change needs a review and a proof that it works.

## Skeleton mapping
- clarify: the pre-flight questions that fix the target system, the change and the rollback. No phase file.
- plan: `plan`, `document-review`, `architecture` and `document-review` phases, with their approval gates.
- do: the `implement` phase.
- check: the `review` phase and the `tests` phase.
- deliver: the `completion` phase followed by `research` for the after-QA modernization scan.

## Phase flow
- plan: list the changes, the order and the rollback steps.
- document-review: independently review `task-description.md` and pass its gate.
- architecture: write `implementation-plan.md` for the infrastructure change.
- document-review: independently review `implementation-plan.md` and pass its gate.
- implement: apply the changes.
- review: examine the changes against the plan.
- tests: run the checks that prove the system works.
- completion: record the accepted result in `completion-report.md`.
- research: run the after-QA modernization scan and write `future-enhancements.md`.
