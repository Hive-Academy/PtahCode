# Code review

## Verdict

REVISE

## Summary

| Metric | Count |
| ------ | ----- |
| Serious issues | 2 |
| Moderate | 1 |
| Minor issues | 1 |

## Serious issues

### Stale task cache

- File: task-cache.ts
- Serious impact: stale entries survive a restart.

#### Reproduction

- Run the test twice.

### Missing invalidation

- File: task-index.ts
- Fix: invalidate after a write.

| Severity | Finding |
| -------- | ------- |
| **Minor** | Clarify the field label. |
| Moderate follow-up | Document the workflow. |

## Moderate issues

### Missing progress marker

- File: task-digest.ts
- Fix: mark partial reads.

## Other notes

- No remaining open items.
