# PR #982 CodeRabbit round 1 review

**Verdict: APPROVED — 8/10.** Reviewed the ten uncommitted files against HEAD `7f8012fc7`; `git diff --check` is clean. No blocking finding.

## BLOCKING

None found. The connected `attach()` failure now reaches its caller without a state push (`machine-connection.ts:468-489`); `MachinesStore` records attach and replay errors from their RPC results (`machines-store.ts:517-555`). The reconnect pass still emits `session-reattach-failed` (`machine-connection.ts:301-321`). On reconnect, a detached view starts one attach and immediately enters `attaching`, while later connected pushes cannot start another (`machines-store.ts:479-495`, `:330-349`). Request tokens discard stale replies (`:340-347`, `:524-530`).

The ID based component effects keep the same machine's object replacements from retriggering work. The fresh `Marked` lexer uses default tokenization like the renderer: the shared extensions decorate rendering or mutate callout text; none supplies a tokenizer (`provide-markdown-rendering.ts:489-497`, `marked-extensions.ts:395-405`). `walkTokens` reaches nested images in lists, blockquotes, tables, and reference links in a direct Marked probe. The fallback escapes both raw `<` and literal `![` from the original text (`remote-markdown.ts:37-42`, `:111-112`); no tested image or HTML input survived.

## Non-blocking follow-ups

- Add a focused test where a reconnect arrives during an explicit attach. The current `attaching` state suppresses a second attach, and a failed in-flight request remains detached until Refresh or the next reconnect; document that intended recovery behavior (`machines-store.ts:483-495`).
- Add reference-image, table, setext, and entity cases to the markdown regression suite. The direct Marked probe found no bypass, but these cases are absent from the new tests (`remote-markdown.spec.ts:48-155`).

No tests or builds were run for this review; the requested scoped verification was already reported as passing. The `angular-frontend-patterns` repository skill was read for the component review.
