# TASK_2026_2309_bigdf — Fall back to per-file patches when a PR diff exceeds 20k lines

## User request

`/orchestrate` (2026-11-23): set the lanes and models used to review PRs, plus issues #1457 and #1481.
The user chose two PRs: this one fixes #1457 only. The lane work is TASK_2026_2310_rvlns
(`feat/review-lane-pool`).

## Issue #1457 (summary)

`GitHubReviewAdapter.getDiff` (`libs/backend/review-github/src/lib/github-review.adapter.ts:199`)
asks for `application/vnd.github.v3.diff`. Above 20,000 lines GitHub answers
`406 {"message":"Sorry, the diff exceeded the maximum number of lines (20000)","errors":[{"resource":"PullRequest","field":"diff","code":"too_large"}]}`.
`request()` (`:158`) throws `GitHubReviewError('http', 'GitHub returned HTTP 406')` and drops the body.
The run shows "Failed in context: GitHub returned HTTP 406 (unknown)" and schedules a retry that can never succeed.

## Gate 0.1

- Ptah MCP tools (`ptah_agent_list`, `ptah_route_decide`, `ptah_memory_search`) are not available in this session.
  Lanes mode: `disabled` (no spawnable lane). Approval mode: `user`.
- Implementer: backend-developer subagent. Reviewer: code-logic-reviewer subagent (same family: recorded reason below).

## Flow

BUGFIX, Partial: `batch` (orchestrator writes B1) -> `implement` -> `review` -> `tests` -> `completion`.
