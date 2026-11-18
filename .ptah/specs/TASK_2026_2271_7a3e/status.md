# Status — phase 1 (design), 2026-11-18

Phase 1 is complete. The user approved the design on 2026-11-18.

## Delivered (`docs/design-system/thoth/`)

- `prototype/thoth-prototype.html` — design of record.
- `prototype/screens/*.jpg` — 27 screens (light and dark at 784, 1168 and 1440, plus states).
- `README.md` — user decisions, files, screen index, open questions.
- `thoth-design-spec.md` — spec with the feature-parity tables (section 12).
- `thoth-apply-plan.md` — phase 2 and phase 3 plan with the `memory:graph` contract.

## Prototype fixes made during the parity review

- Health view: storage and retention cards, Live events, Retry embedder, Open binding folder,
  Copy diagnostic.
- Skills: the panel did not render (`optLabel` read `OPTS` for an `sk:` key). Fixed.
- Skills: Plugin settings link in the toolbar hint.
- Frame: the shell nav did not collapse at 784 (a container query cannot style its own
  container). The frame now gets a `data-compact` flag.
- Frame: the drawer was positioned against the viewport. `.app` is now `position: relative`.

## Facts found (Memory backend)

- Embeddings: `memory_chunks_vec`, FLOAT[384], per chunk. Optional: `vecStatus.available`.
  When off, search is BM25 only (`bm25Only: true`).
- k-NN: `libs/backend/memory-curator/src/lib/memory-search.service.ts` (~line 520) and
  `scopedVectorCandidates` in `scoped-vector-search.ts` (cap `MAX_SCOPED_VECTOR_CANDIDATES`
  = 2048, k clamped 1..100).
- `memory_chunks_vec` uses the default L2 distance of sqlite-vec. The embedder writes unit
  vectors, so cosine similarity = `1 - d * d / 2`.
- `scopedVectorCandidates` takes the global top 2048 and filters afterwards. The graph does not
  use it. The graph computes exact pairwise similarity over the selected nodes in the worker.

## Independent review (2026-11-18)

A reviewer checked the RPC contract claims, the parity tables and the component mapping against
the source. Two blockers (distance metric, k-NN recall) and the missing parity rows were
corrected in the docs. The component mapping had no finding.
