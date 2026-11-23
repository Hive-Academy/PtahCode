# Decisions — TASK_2026_2322_7ad7

| # | Decision | Reason |
| - | -------- | ------ |
| 1 | Prompt waits read from SdkPermissionHandler pending maps (ChangeNotifyingMap, registry onChange) | No parallel tracker; all delete sites notify |
| 2 | CLI lane prompts do not count as a wait of the parent turn (`blocksTurn=false`) | They are keyed to the parent id but its turn keeps running |
| 3 | Source retries the prompt subscription on every read until it resolves | Electron registers WEBVIEW_MANAGER after the SDK services |
| 4 | Background success writes last_indexed_at, clears last_error, writes sha only when non-null | Review M2, M4 |
| 5 | Storm is decided before twin probes for TS transitions | Review M5 |
| 6 | M6 (format version) not bumped | A warm start runs a census each launch, so new-flavour files index then; a bump would reparse everything |
| 7 | M7 TOCTOU accepted | Best effort for a non-adversarial workspace |
