# Example: software task (FEATURE)

Pack: software. Skeleton: clarify, plan, do, check, deliver.

Request: add a retry option to the export command.

## Skeleton steps
| Skeleton step | Phase | Output |
| --- | --- | --- |
| clarify | pre-flight questions | Scope and acceptance criteria |
| plan | plan | `implementation-plan.md` |
| plan | design | Design handoff for the retry option |
| do | batch | `batches.md` with file-disjoint batches |
| do | implement | Code changes per batch |
| check | review | `code-review.md` |
| check | tests | `test-report.md` |
| deliver | completion | Commit, pull request, close-out |

## Phase order
plan → design → batch → implement → review → tests → completion
