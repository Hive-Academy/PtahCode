# Step 2 real tasks

## Real task 1: review

A Claude API lane ran round 2 using only `phases/review.md`. Its verdict was APPROVED with 0 blocking findings. The Phase file fitness section found that the file did not define a re-review finding status, did not connect the severity bands to the verdict, and did not set a report length rule. It also did not say how to handle unattributed changes or a refused check.

Step 2 added two Output contract rules. The reviewer now uses blocking, serious and minor bands and gives REVISE while a blocking finding remains. A re-review now marks each earlier finding fixed, open or disputed and lists new findings apart.

Follow-ups: set a length rule, require review of unattributed changes, and define evidence fallback when a check is refused.

## Real task 2: visual-review

Status: blocked. The phase needs a running Electron app from this worktree. Project rules forbid serve and dev here. Step 2 changes no Angular template. Its only UI effect is the Bot icon fallback in chat-ui agent-marks, covered by `agent-marks.spec.ts`.

Follow-up: run a visual-review phase in Electron at the next UI task.
