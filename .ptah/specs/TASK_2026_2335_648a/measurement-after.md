# Phase 4 measurement (2026-11-28, Electron dev build of feat/prompt-trim)

Workspace `.claude-worktrees/prompt-trim-measure` (detached at 393505475), model Fable 5.2 (same
as the production baseline), prompt "Reply with the single word: ok". Tokens are the first
request's `input + cache_creation + cache_read` from the session transcript.

| Run | Mode | Tokens | Cache write | Cache read |
|---|---|---:|---:|---:|
| Production baseline (user `/context`) | preset | 45.5k | – | – |
| #1522 dev build (Haiku, before) | preset | 51,646 | 51,644 | 0 |
| m1 new session, no enhanced prompt | preset | 44,741 | 44,739 | 0 |
| m2 new session, enhanced prompt present | Ptah full prompt | 44,988 | 44,986 | 0 |
| m3 second new session | Ptah full prompt | 43,978 | 13,281 | 30,695 |
| m4 toggle off (explicit) | preset | 44,741 | 0 | 44,739 |

Character deltas against the #1522 dev request: system prompt 21,733 -> 17,685 (preset) or
16,676 + dynamic (full prompt, includes the 5,805-char project prompt); attachments
30,060 -> 17,057; tools 70,774 -> 65,957 (Ptah tools 28,855 -> 24,037); CLAUDE.md 14,685 ->
15,408 (main changed).

Findings:
- The full prompt carries Ptah + the project prompt for about the cost of the bare preset
  (preset + project prompt would be about 46.2k).
- Cross-session cache: m3 reads the tools and static system block (30.7k) from cache. The
  static block is byte-identical across sessions. Before the fix a new session re-wrote 25.8k.
- Toggle UI: no enhanced prompt -> off and disabled ("Run Setup to generate the project prompt
  first."); enhanced prompt present -> on by default ("Ptah Enhanced"); switching off -> preset.
- Follow-up: in full-prompt mode the SDK still sends its own `# Environment` attachment (working
  directory, platform, shell, OS, git, model). Ptah's environment block repeats those fields
  (about 400 chars) and prints `Model: default`. Keep only the date line.
- Follow-up: the per-query block (symbols) after the boundary invalidates the cached messages
  that follow it (m3 wrote 13.3k). Moving it into the last user message would cache them too.
