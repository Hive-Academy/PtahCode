# Pack: software

## Discipline
Software work adds features, fixes bugs or improves existing code. FEATURE, BUGFIX and REFACTORING tasks use this pack. Define the change, plan its implementation, review the result, run focused tests and record completion.

## Skeleton mapping
- clarify: pre-flight questions confirm scope. No phase file.
- plan: use `plan`, `document-review`, optional `research` and `design`, and `architecture` to specify the change.
- do: use `batch` to split the work and `implement` to make the change.
- check: use `review` to inspect the change and `tests` to verify it.
- deliver: use `completion` to record the accepted result.

## Phase flow
- plan
- document-review
- research
- design
- architecture
- batch
- implement
- review
- tests
- completion

The task type selects the detailed flow. Optional phases and gates remain in their existing order:

- FEATURE: `plan` -> `document-review` -> [`research`] -> [`design` -> `document-review` -> Gate 1.7] -> `architecture` -> `document-review` -> `batch` -> `implement` -> `review` -> `tests` -> `completion` -> `research` (after-QA modernization scan).
- BUGFIX: [`research`] -> `batch` -> `implement` -> `review` -> `tests` -> `completion` -> `research` (after-QA modernization scan).
- REFACTORING: `architecture` -> `document-review` -> `batch` -> `implement` -> `review` -> `tests` -> `completion` -> `research` (after-QA modernization scan).
