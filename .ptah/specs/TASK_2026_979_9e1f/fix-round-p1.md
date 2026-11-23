# P1 fix round (decisions rows 27-28)

| Batch | Project(s) | Items | Depends | Status |
|---|---|---|---|---|
| F1 | platform-core | style S1 shared policy fn + scope builders; style S2 prefix constant | - | COMPLETE |
| F2 | cli-agent-runtime | logic S1 + env allowlist; M1; M5; M6; adopt F1; install success minor | F1 | COMPLETE |
| F3 | vscode-lm-tools | logic M4 slot writer worktree guard; M2; M3; style S3 extract gateway bridge; adopt F1 | F1 | COMPLETE |
| F4 | agent-sdk, cron-scheduler | style S3 move gateway helpers; adopt F1; M8; job-runner `?:`; unused exports | F1 | COMPLETE |
| F5 | harness-sync, rpc-handlers | submodule false positive; @deprecated ctor param | - | COMPLETE |
