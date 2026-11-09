# Context — sync review status to GitHub

User request (2026-11-09): show and sync machine-side review status on GitHub, like CodeRabbit.

Today: github-review-publication.adapter.ts posts one summary issue comment (POST then PATCH) and
inline review comments. No check runs or commit statuses. libs/backend/cron-scheduler exists but no
review job uses it.

Scope:
1. Check Run per review run on the head SHA: queued -> in_progress (progress text per lens) ->
   completed with conclusion success/neutral/failure from finding severity. Output summary lists
   findings, lanes, families, usage. Requires GitHub App installation token (PtahCode app);
   fall back to commit statuses with a personal token.
2. Live progress in the summary comment ("Reviewing... 3/6 lenses").
3. Scheduled job (cron-scheduler): poll open PRs, queue a review on a new head SHA not yet
   reviewed, sync resolved/unresolved threads back into findings.
4. Recovery at startup: find in_progress checks owned by this machine; resume or complete as
   cancelled with a reason.
5. Optional: document making "PtahCode Review" a required check.

Depends on TASK_2026_900_a3f1 (same files in review-github). Electron host first.

## User decisions (2026-11-09)
- Auth: commit statuses now through the existing PtahCode personal token (PtahCode is a GitHub
  *User* account, not an App). Keep a typed status-port so a GitHub App Check Run provider can be
  added later without changing review-core. Do not build the App provider in this task.
- Plans for 900 and 901 approved; implement in sequence (900 then 901) without another approval stop.
- Conclusion policy: Critical/Major -> failure, Minor/Nitpick -> success-with-note (statuses have
  no neutral; use success with description) — record the mapping in the plan.
