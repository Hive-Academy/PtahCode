---
status: in_review
type: bugfix
title: One predictable queued-message flow
description: >-
  A message sent while a turn may still run is always queued first and shown
  as a queued card in the transcript with Interrupt & send (Claude) or Send
  now (Codex). Queuing no longer denies open permission prompts, and a tab the
  UI thinks is idle but whose backend turn still runs no longer gets a silent
  hold or an interrupting normal send.
---

User decisions (2026-11-21): queue only, never deny permission prompts; card
in the transcript; Codex keeps native steering labelled "Send now".

Pull request: #1461
