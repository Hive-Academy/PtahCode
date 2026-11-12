# Web trends

Date: 2026-11-12. Method: 6 web searches. Evidence is from search snippets. Primary pages were NOT opened in full. CONFIRMED = a primary-source URL appeared in the results and its snippet supports the claim. X posts were not searched directly.

All three names map to real products. None is a coding-only feature. All three are persistent, always-on agents with a cloud computer.

## Grok bot
- Real product: **Grok Bot** (xAI, now branded SpaceXSI). Announced 2026-08-11. Beta. CONFIRMED https://x.ai/news/introducing-grok-bot
- Pitch: "team of always-on agents" with their own computer. They work in apps, inboxes and sites like a human, also where no API/MCP exists. Jobs continue when the laptop is closed. A Bot returns when it needs approval. CONFIRMED (same URL); REPORTED https://www.unite.ai/xai-launches-grok-bot-always-on-ai-teammates-with-their-own-cloud-computers
- Availability: desktop (Linux build posted) and iOS. Sources disagree on tiers: launch said SuperGrok Heavy / Cursor Ultra / Cursor Teams Premium; x.ai/news (Aug 26) says SuperGrok, Cursor Pro, all Cursor Teams. Own usage, separate from Grok and Cursor plans. CONFIRMED https://x.ai/news ; REPORTED unite.ai.
- Unit = a **Bot**: persistent, has a roster entry, presence, own screen, own memory. There is a Primary Bot, team Bots, template skills, routines. CONFIRMED https://x.ai/news/designing-grok-bot , https://docs.x.ai/grok-bot/faq (titles/snippets only; exact config fields UNVERIFIED).
- Definition format: UI plus chat and skills (private skills, "From template"). A file format for a Bot was not found. CONFIRMED https://x.ai/changelog/bot
- Run mode: cloud, always-on, parallel (each Bot has its own screen). All Bots of one user SHARE one persistent Linux VM (files, cookies, logins, CLI credentials). Docs say: do not use separate Bots as a security boundary. REPORTED (vendor docs quoted) https://cellcog.ai/blog/grok-bot-problems , https://flaviocopes.com/grok-bot
- Direct chat: yes. Each Bot is a chat thread; group chats let Bots share context. REPORTED https://supermemory.ai/blog/grok-bot-memory
- Memory: per-Bot memory. A few facts (name, time zone) are shared across Bots. No one-click export. REPORTED supermemory link.
- Sharing: Pages (reports, memos, dashboards) can be shared and unshared; team Libraries. A Bot marketplace was not found. CONFIRMED https://x.ai/changelog/bot
- Likes: easy setup, browser reach on API-less sites, persistence. REPORTED https://cellcog.ai/blog/grok-bot-problems
- Complaints: each Bot is one unbounded thread; no fresh session, no manual compaction, no context meter; duplicating Bots splits memory; stale memory mixes projects; $200 price. REPORTED cellcog link, https://natesnewsletter.substack.com/p/grok-bot-review
- Related coder product: **Grok Bot is not Grok Build.** Grok Build is the coding agent (TUI, headless, ACP). Grok 4.6 is tuned for the Build harness. CONFIRMED https://docs.x.ai/build/overview ; REPORTED https://www.basenor.com/blogs/news/xai-launches-grok-4-6-1753-elo-half-the-price-of-rival-frontier-models

## Codex dots
- Real product: **dots** (OpenAI), always-on agents in ChatGPT, reachable "through ChatGPT or Codex". Announced at DevDay 2026-09-29. Not a Codex CLI feature. CONFIRMED https://openai.com/index/introducing-dots/ ; docs https://learn.chatgpt.com/docs/dots
- Unit = a **dot**: has a name and a chosen character, own cloud computer and browser, memory, connected apps, scheduled work. You give a goal and boundaries; it asks when a decision needs you. REPORTED https://coursiv.io/blog/chatgpt-dots (docs snippet confirms "always-on agent... asks for your input").
- Definition: created on desktop via UI (name, character, plugins such as Gmail/Calendar/Drive, computer access). No file format found. REPORTED tutorial (Mike Murphy AI, Facebook).
- Run mode: cloud, background. A dot can use background agents, start cloud threads, create Work or Codex tasks on a connected computer and continue local Codex threads. CONFIRMED https://learn.chatgpt.com/docs/dots
- Direct chat: yes, in ChatGPT, voice call, Slack, Teams; texting is a limited US Pro beta. Same context in every channel. CONFIRMED docs; REPORTED https://www.lindy.ai/blog/chatgpt-dots
- Harness: built on the open-source Codex harness; shares plugins already installed. REPORTED https://x.com/dkundel/status/2106141525306397099 (OpenAI staff post, so near-primary).
- Persistence: persistent identity, memory, schedule. One primary dot per person at start. REPORTED lindy.ai.
- Model: GPT-6 Astra. REPORTED coursiv.io.
- Availability: Pro 100/200/500 (18+, not EEA/UK/Switzerland), Business Premium worldwide, Enterprise beta (admin opt-in). Dot chat does not count toward limits; Codex/Work tasks do. Post-launch limits unpublished. REPORTED coursiv.io, lindy.ai; community thread https://community.openai.com/t/dots-looks-exactly-like-what-i-need-but-it-s-unavailable-for-pro-users-in-the-eea/1402170
- Vs Codex: Codex = a session you start, bounded, ends when done. A dot = persistent, notices work and can delegate to Codex. REPORTED https://aiskill.market/blog/dots-vs-codex-two-very-different-kinds-of-autonomy
- Sharing: not found. UNVERIFIED.
- Likes: Kundel: "favorite way of using Codex", less mental load, proactive, Slack tagging. Users want it as an orchestrator. REPORTED X post and community thread.
- Complaints: regional exclusion (UK/EEA Pro); a Reddit user sees no advantage over a new Codex chat. REPORTED https://www.reddit.com/r/codex/comments/1wtyefd/struggling_to_understand_the_purpose_of_dots_can/

## Claude duet
- Real product: **Claude Duet** (Anthropic), a separate app on iOS, Android and claude.ai. Research preview, waitlist, US. Runs on Opus 5.5. It is an app, not a model. CONFIRMED https://claude.com/resources/articles/claude-duet ; https://claude.com/product/claude-duet ; REPORTED https://www.datacamp.com/blog/claude-duet
- Unit = one ongoing thread with one proactive agent. It messages first (morning brief, calendar conflicts, email follow-ups). Not a user-defined multi-agent unit. CONFIRMED claude.com article; REPORTED DataCamp.
- Definition: no file format. It reuses Claude memory, skills and connected apps. You set what to hear about and how often. CONFIRMED claude.com article.
- Run mode: cloud computer, keeps working after the app closes. Checks accounts every few hours (one reviewer reports every 3 h, 9am-10pm). Asks before send, pay, sign, delete. Credentials follow the Managed Agents design; actions pass the auto-mode classifier. CONFIRMED claude.com article; REPORTED https://www.youtube.com/watch?v=0xyHuhsRdb4
- Direct chat: yes, typed or spoken, one thread.
- Availability: Pro, Max, Ultra at no extra cost; counts against normal limits. CONFIRMED claude.com article.
- Sharing: none found. UNVERIFIED.
- Link to Claude Code: a Reddit post claims "Claude Code is now in Claude Duet". UNVERIFIED (no primary source). https://www.reddit.com/r/ClaudeAI/comments/1xbwkgf/claude_duet_anthropic_just_casually_dropped_the/
- Likes/complaints: little public data found. Complaint themes: check-ins use limits, waitlist, US only. REPORTED DataCamp, YouTube.
- Vs subagent: a subagent is a static role called by a parent through a tool. Claude Code subagents stay that way (limits: 20 concurrent, 200 per session, depth 3; background more common). Duet is a persistent top-level agent the user talks to. REPORTED https://www.digitalapplied.com/blog/claude-code-subagent-depth-limits-budget-caps-2026

## Comparison table

| Feature | Unit | Definition format | Run mode | Direct chat | Persistence | Sharing | Availability |
|---|---|---|---|---|---|---|---|
| Grok Bot (xAI) | Bot (many per user) | UI, chat, skills, routines; no file found | Cloud, always-on, parallel; shared VM | Yes, per-Bot thread, group chats | Per-Bot memory, roster | Shared Pages, team Library | Beta; SuperGrok/Cursor tiers, desktop+iOS |
| Dots (OpenAI) | Dot (one primary) | Desktop UI: name, character, plugins, computer | Cloud, always-on; spawns background agents and Codex tasks | Yes: ChatGPT, voice, Slack, Teams | Name, memory, schedule | Not found | Pro 100+, Business Premium, Enterprise beta; region limits |
| Claude Duet (Anthropic) | One proactive agent | Reuses memory, skills, connectors | Cloud computer; checks every few hours | Yes, one thread | Claude memory | Not found | Research preview, US waitlist, Pro/Max/Ultra |

## Wider trend
- Persistent named agents with their own cloud computer shipped from three vendors in about 11 weeks (Aug 11, Sep 29, Oct 2026). https://x.ai/news/introducing-grok-bot , https://openai.com/index/introducing-dots/ , https://claude.com/resources/articles/claude-duet
- Shift from "run a task" to "always-on, proactive": dots notice work and delegate to Codex. https://aiskill.market/blog/dots-vs-codex-two-very-different-kinds-of-autonomy
- Reach through chat apps (Slack, Teams, voice, phone) instead of an IDE only. https://learn.chatgpt.com/docs/dots
- Subagent fan-out gets guardrails (20 concurrent, 200 per session, depth 3) and background runs spread. https://www.digitalapplied.com/blog/claude-code-subagent-depth-limits-budget-caps-2026
- Approval gates for irreversible actions (send, pay, sign, delete) and classifier-based safety. https://claude.com/resources/articles/claude-duet
- Shared harness across coding and general agents (dots on the Codex harness). https://x.com/dkundel/status/2106141525306397099
- Pain point: context and memory management of long-lived agents (unbounded threads, stale memory). https://cellcog.ai/blog/grok-bot-problems
- Bundling into subscriptions with separate usage pools or shared limits. https://x.ai/news/introducing-grok-bot

## Open points
- Primary pages were not read in full. Open the docs for exact Bot, dot and Duet configuration fields.
- Grok Bot tier list conflicts between sources.
- No evidence of sharing or marketplaces for dots or Duet.
- The Duet and Claude Code link is UNVERIFIED.
- X discussion was not searched directly. Search X for sentiment.
