# Back off review status sync on GitHub permission errors

## Symptom
The installed Ptah build logs `Review status sync failed: GitHub bot lacks permission` about
once per second (81k lines on 2026-11-12, 52 MB log). No review status has ever synced:
all 222 `review_status_sync` rows have no `external_id`, 195 are `sync_pending` with the same error.

## Cause
1. Status sync (PR #1039) writes a GitHub commit status (`POST /repos/{o}/{r}/statuses/{sha}`).
   That needs the fine-grained permission "Commit statuses: Read and write". The review bot
   token has Actions, Artifact metadata, Contents, Metadata, Pull requests, and not that one.
   PR comments and reviews (Pull requests permission) work: 92 publications confirmed.
2. `ReviewStatusCoordinatorService.publish` retries every row after a fixed 60 s and logs every
   failure. With 195 pending rows that is a retry storm of roughly 3 requests and log lines a second.

## Fix (this task)
- `GithubReviewStatusAdapter`: the 403 message names the missing permission.
- `ReviewStatusCoordinatorService`: a permission, authentication, missing-token or rate-limit
  refusal blocks status writes for that repository (30 min, or the reset GitHub reports, at most
  1 h). Pending rows are deferred without a request. The same failure is logged once per 10 min.
  A successful write clears the block.

## Operator action (not code)
Add "Commit statuses: Read and write" to the review bot token for Hive-Academy/PtahCode.
Pending rows then sync on the next retry after the block ends (or after an app restart).

## Out of scope
The Antigravity lane quota exhaustion (429) that makes lens runs `partial` is a separate task.
