# Context

## User request (2026-11-20)
Review the Settings pages with the second Claude CLI lane and Antigravity (agy). Reported defects:
- Modals overflow the Electron window.
- Text buttons where icon buttons are correct; weak alignment on many pages.
- Providers: the Ptah CLI sections (defaults, instances) are detached from the Lanes table. Show the
  CLI lanes in one section with small separation. Show CLI tools that are not installed as "add more".
- Advanced: wrong paddings and alignment.
- All pages: too few icons.
- Claude Code tools & skills: very long, no visual structure.

Screenshots: `evidence/1.png` (Lanes, expanded Claude row), `evidence/2.png` (Lanes + Ptah CLI
defaults/instances), `evidence/3.png` (Advanced), `evidence/4.png` (Claude Code tools & skills).

## Gate 0.1
- Preference source: current user instruction (pin): `claude` lane (stored account "Second Lane") + `antigravity`.
- Mode: enabled. Approval: lane-review. Type REFACTORING, depth Full (UI redesign of existing surfaces).
- ptah_agent_list: codex installed (room), antigravity installed (limit unknown), grok installed,
  claude installed (limits not tracked), Ollama Code AT LIMIT, kimi code AT LIMIT.

## Phase flow
review (2 lanes, findings) -> user checkpoint -> design/prototype -> Gate 1.7 -> batch -> implement -> review -> visual-review -> completion
