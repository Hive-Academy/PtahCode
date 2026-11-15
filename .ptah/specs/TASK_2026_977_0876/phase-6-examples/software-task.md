# Example: software task (FEATURE)

Pack: software. Skeleton: clarify, plan, do, check, deliver.

Request: add a retry option to the export command.

## Skeleton steps
| Skeleton step | Phase | Output |
| --- | --- | --- |
| clarify | pre-flight questions | Scope and acceptance criteria |
| plan | plan | `task-description.md` |
| plan | document-review | Review task description |
| plan | design (optional) | UI handoff, when needed |
| plan | architecture | `implementation-plan.md` |
| plan | document-review | Review implementation plan |
| do | batch | `batches.md` with file-disjoint batches |
| do | implement | Code changes per batch |
| check | review | `code-review.md` |
| check | tests | `test-report.md` |
| deliver | completion | Commit, pull request, close-out |

## Phase order
plan → document-review → architecture → document-review → batch → implement → review → tests → completion
