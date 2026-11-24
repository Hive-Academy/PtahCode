# PR fix 1: lane stderr redaction (PR #1496)

## Finding

The PtahCode review bot flagged a Major security issue at `lane-stderr-redaction.ts:26`. The value part of
`QUOTED_SECRET` was `[^"']+`, so it stopped at the first quote of either kind, and even at an escaped one.
For `"token": "ab\"cd"` the text `\"cd"` stayed in clear text. A value that held the other quote type,
`"token": 'a"b'`, leaked the same way.

The same class of bug was in `INLINE_SECRET`:
- `token="ab cd"` was not redacted at all, because the value could not start with a quote.
- `token=ab"cd` leaked `"cd`.
- `Bearer ab"cd` leaked `"cd`.

## Fix

File: `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/provider-session/lane-stderr-redaction.ts`

- **QUOTED_SECRET**: the opening quote of the value is captured as group 2. The body is
  `(?:\\.|(?!\2)[^\\\r\n])*`, so the value runs to the same closing quote. The other quote type and
  backslash escapes stay inside it. An unterminated value runs to the end of the line. The replacement is
  now `$1$2[REDACTED]`, and the closing quote is kept.
- **Key part of QUOTED_SECRET**: the key text on each side of the secret word was unbounded
  (`[^"']*...[^"']*`), which made it quadratic. A quote followed by 100 KB of `token ` words took about
  1.2 s in a node measurement. That text is now capped at `[^"'\r\n]{0,128}` on each side. Trade-off: a
  quoted key with more than 128 characters on one side of the secret word is no longer matched by this
  rule.
- **INLINE_SECRET field value**: the value is now
  `(?:"(?:\\.|[^"\\\r\n])*"?|'(?:\\.|[^'\\\r\n])*'?|[^\r\n,"'])+`. It may start with or hold a quoted
  string, escapes are allowed, and an unterminated string runs to the end of the line. Only a comma
  outside quotes ends the value. This fails safe: inside JSON, for example `"url":"a?token=x","m":"n"`, it
  can redact more than the value itself.
- **Bearer value**: changed from `[^\s,;"']+` to `[^\s,;]+`.
- **Backtracking**: within each body, the alternatives never match the same character, and each top-level
  alternative starts on a different character. There is no nested ambiguity, so the match time stays
  linear.

## Spec cases added (`lane-stderr-redaction.spec.ts`)

- An escaped double quote in a double-quoted value. An escaped single quote in a single-quoted value.
- The other quote type inside the value, both ways round.
- An escaped backslash just before the real closing quote.
- An unterminated quoted value, which is redacted to the end of the line.
- An inline value that starts with a quote, a quote inside an inline value, and a quote inside a Bearer
  credential.
- Four lines of about 100 KB, each with a 250 ms limit:
  - an open quoted value
  - about 9,000 quoted secrets
  - an inline value made of escaped quotes
  - a quote followed by 17,000 secret words (the key-part worst case; the line has nothing to redact, so
    it must come back unchanged)

All the cases that existed before are unchanged and still pass.

## Checks

| Command | Result | Log |
| --- | --- | --- |
| `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath .../lane-stderr-redaction.spec.ts .../provider-session-lane-handle.spec.ts` | exit 0; 2 suites, 105 tests passed | `.ptah/tmp/prfix1-jest.log` |
| `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json` | exit 0, no output | `.ptah/tmp/prfix1-tsc.log` |
| `npx eslint <both changed files>` | exit 0, no output | `.ptah/tmp/prfix1-eslint.log` |

As instructed, `npm run verify` and `nx` were not run. Nothing was committed.

## Decisions

- **Key length cap of 128.**
  - Options: leave the key part unbounded (quadratic), use an atomic-group emulation, or cap the length.
  - Evidence: the 1.2 s measurement above. Real secret key names are short.
  - Reversible: yes.
- **INLINE values may over-redact inside JSON.**
  - Options: stop at quotes, which leaks; or let only a comma outside quotes end the value, which can mask
    more text.
  - This fails safe. Severity is still classified from the original line by `laneStderrLine`.
  - Reversible: yes.

## Files

- MODIFIED `D:\projects\PtahCode\.claude-worktrees\agy-acp-only\libs\backend\cli-agent-runtime\src\lib\cli-agents\cli-adapters\provider-session\lane-stderr-redaction.ts`
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\agy-acp-only\libs\backend\cli-agent-runtime\src\lib\cli-agents\cli-adapters\provider-session\lane-stderr-redaction.spec.ts`
