# Decisions - TASK_2026_893_6b26

| # | Decision | Evidence | Source | Reversible |
|---|----------|----------|--------|------------|
| 1 | Type FEATURE, depth Partial, research first | Request says "investigate ... easiest way"; scope is known (chat page + RTL) | orchestrator rules | yes |
| 2 | CLI lanes enabled, approval mode lane-review, codex first | memory orchestration-executor-preference; global CLAUDE.md | memory | yes |
| 3 | Skip PM; research report doubles as scope input | Request is narrow and explicit; PM adds cost without new information | orchestrator | yes |
| 4 | No designer/prototype; before/after Electron screenshots instead | RTL rendering of existing chat adds no new surface | orchestration SKILL.md UI rule | yes |
| 6 | Use research-report.md §4 as the implementation plan; no separate architect phase | Concrete file:line change list, ~6 files, CSS + attributes only; saves a paid round | orchestrator | yes |
| 7 | Gate 2 passed in lane-review mode: in-process orchestrator reviewed the CLI-authored plan, APPROVED | implementation-plan-review.md | peer (cross-side) | yes |
| 8 | No team-leader; one frontend batch on codex | Single file-disjoint scope in chat + chat-ui libs | orchestrator | yes |
| 9 | Option A (content-host dir=auto + per-block unicode-bidi plaintext, code LTR); no detector, no global RTL, no font bundling | research-report.md Options table | lane research + orchestrator review | yes |
| 10 | Accept review finding 1 (mixed-direction list bullets / quote bars follow host direction) as a documented limitation; follow-up = per-block dir via markdown renderer | code-logic-review.md F1; fix needs libs/frontend/markdown, out of scope | review + orchestrator | yes |
| 11 | Keep dir="auto" on .cs-answer (review F4) | parts.answer is text-only (turn-answer-split.utils.ts:104-110) | review | yes |
| 12 | Code review family: reviewer antigravity, implementer codex (opencode tried first, usage limit) | code-logic-review.md, code-logic-re-review.md | lane fallback | n/a |
| 13 | Fix all 5 CodeRabbit Minor findings in one round (local fixes); accented H1/H2 get `dir="auto"` in marked-extensions.ts | fix-round-2-report.md; sanitizer keeps `dir` | CodeRabbit + codex | yes |
| 14 | Re-review 2 in-process (weaker evidence): no other non-Claude family had room | code-logic-re-review-2.md; ptah_agent_list 2026-11-08 | orchestrator | n/a |
| 15 | Fix F1 now (overrides decision 10): `dir="auto"` on ul/ol/blockquote from the marked renderer | CodeRabbit 4507888775 on df442ee9c; PR already edits marked-extensions.ts, so the deferral reason is gone | orchestrator | yes |
| 16 | Fix PtahCode review 5819906454 (list-card, callout, H3 physical left styles) in one sweep: convert all chat markdown decorative styles to logical properties; callout direction from body | PtahCode findings 4508021549, 4508021551 on 4866a22ce; CodeRabbit rate-limited on that head | orchestrator | yes |
| 5 | Do not rebase old branch claude/sleepy-turing-pdzxlm; harvest ideas only | 52 commits, landing-focused, code shifted | user request | yes |
