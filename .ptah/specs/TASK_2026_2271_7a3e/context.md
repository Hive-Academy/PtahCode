# Context — Thoth Memory and Skills redesign

Part of the design epic that moves screens to the shared components of `@ptah-extension/ui`.

## User decisions (2026-11-18)

- Follow the latest design target: `docs/design-system/settings/` (rev 2 "Flight deck").
- Memory: replace the long scroll list with a graph view, with advanced options and a high-quality UI.
- Graph edges: semantic + shared. New backend RPC `memory:graph` returns nearest-neighbor
  similarity edges from the sqlite-vec embeddings, plus edges for a shared subject or session.
- Graph renderer: add a canvas/WebGL graph library (for example Sigma.js + graphology, or
  d3-force), loaded lazily.
- Scope: design first, both panels. Deliver a design spec and an HTML prototype in
  `docs/design-system/thoth/` for user approval. Then implement Memory, then Skills, as separate PRs.

## Phases

| Phase | Content                                            | PR    | State                                  |
| ----- | -------------------------------------------------- | ----- | -------------------------------------- |
| 1     | Design spec + prototype (docs/design-system/thoth) | #1427 | in review (design approved 2026-11-18) |
| 2     | Memory panel + `memory:graph` RPC                  | —     | not started                            |
| 3     | Skills panel                                       | —     | not started                            |
