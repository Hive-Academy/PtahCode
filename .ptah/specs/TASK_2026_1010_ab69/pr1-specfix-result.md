# PR1 chat spec fixes

## Files changed

- `libs/frontend/chat/src/lib/components/molecules/agent-card/agent-card-flat-header.spec.ts`
- `libs/frontend/chat/src/lib/components/molecules/agent-card/agent-card-unified.spec.ts`
- `libs/frontend/chat/src/lib/components/molecules/agent-card/cli-agent-output.component.spec.ts`
- `libs/frontend/chat/src/lib/components/molecules/agent-card/stdout-visibility.spec.ts`
- `libs/frontend/chat/src/lib/components/organisms/agent-monitor-panel.component.spec.ts`
- `libs/frontend/chat/src/lib/components/templates/chat-view.component.spec.ts`

Each affected TestBed now provides a fake `PTAH_CLOCK`. The CLI output lifecycle test checks that the header timer acquires the fake clock while running and releases it when completed.

## Verification

`npm run verify -- -t test -p chat -- --testPathPatterns="agent-card|agent-monitor-panel|chat-view"` passed. The same result was displayed with `--output-style=static` from the Nx cache: **18 suites passed, 0 failed, 18 total; 327 tests passed, 0 failed, 327 total**.

## Visible text changes

None.

## Exceptions and open points

None. The existing unrelated worktree changes were left untouched.
