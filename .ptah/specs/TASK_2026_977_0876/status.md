# Phase 6 Status

## Current state
- **Date**: 2026-11-15
- **Branch**: feat/phase6-general-workflow
- **Slices completed**: 1, 2, 3, 4. Fix round 1 done (findings F1-F10).
- **Review**: `phase-6-review.md` gave REVISE. `phase-6-rereview.md` gave APPROVE.
- **Next**: push, open the pull request, watch CI and the bot review.

## Decision for finding F3
The builder pack routing is removed. The builder equals main again. The files `packs/*.md`
are the single source of the pack flows. `scripts/orchestration-skill/pack-parser.ts` parses
them, and the skill validator calls it.

## Follow-up items (minor, from the re-review)
- N1: the parser skips bullet lines that do not match.
- N2: `workTypes` is empty for the research, content and operations packs.
- N3: no cross-check between `stepMap` and `phaseFlow`.
- N4: the shared spec uses flows that no pack has.
- N5: the example tests are weak and read a task folder.

## Gates (all passed)
- Manifest generate and check: up to date, 227 files.
- validate-skill: 0 errors, 0 warnings.
- Role census: exit 0. Degradation audit: exit 0.
- Skill trees and command copies: byte-identical. LF only.
