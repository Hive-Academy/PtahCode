# Web trends

As of 2026-11-12. CONFIRMED = primary source; REPORTED = secondary source; UNVERIFIED = source does not establish it. “Codex dots” is a mistaken attribution: dots live in ChatGPT, though they can start Codex tasks. [CONFIRMED](https://openai.com/index/introducing-dots/)

## Grok bot

- **CONFIRMED:** xAI launched Grok Bot August 11, 2026 as a beta app for persistent AI teammates, distinct from Grok Build CLI. It launched for SuperGrok and several Cursor paid plans on desktop/iOS; enterprise was waitlisted. [Launch](https://x.ai/news/introducing-grok-bot)
- **CONFIRMED:** A **Bot** is created in the UI with a name and avatar; the user explains its job, sources, approval boundaries and first task in chat. Durable rules go into memory. The design includes identity, runtime, tools, saved Skills and automatically triggered Routines. Personal Bots have no description/settings form. [Docs](https://docs.x.ai/grok-bot/bots) · [Design](https://x.ai/news/designing-grok-bot)
- **CONFIRMED:** Bots work on cloud computers after the user leaves. Users message them directly; multiple Bots work in parallel, coordinate and retain conversation and preferences. This durable, directly reachable worker differs from a parent-invoked Task subagent. [Launch](https://x.ai/news/introducing-grok-bot)
- **CONFIRMED:** Public/team links distribute installable **templates** of instructions, selected memories, skills and plugins, excluding sensitive code/scripts; a curated marketplace lists templates. [Guide](https://x.ai/bot/guides/templates-for-grok-bot) · [Marketplace](https://x.ai/bot/marketplace)
- **REPORTED:** One commentator likes separate specialist Bots, but says complex tasks may stall and need prompting. [Wyndo](https://aimaker.substack.com/p/personal-ai-agent-grok-bot-vs-claude-duet)

## Codex dots

- **CONFIRMED:** OpenAI launched **dots** September 29, 2026 in **ChatGPT**, not Codex CLI/app or a `.dots` file format. Rollout: Pro and Business Premium in eligible markets; Enterprise/Edu/Healthcare admin-enabled beta. [Announcement](https://openai.com/index/introducing-dots/)
- **CONFIRMED:** Create a **primary dot** in ChatGPT desktop/web, name it, connect apps and set Custom Rules allowing, requiring approval for, or blocking actions. One dot is included; additional dots are planned. Organizational specialist dots with their own identity are limited to pilots. No public file schema, model picker or schedule field is described. [Announcement](https://openai.com/index/introducing-dots/)
- **CONFIRMED:** Dots have a cloud computer/browser, work around the clock on several projects and do proactive read-only research. Users inspect, redirect and chat or call via ChatGPT; Slack/Teams messaging carries context across channels. Feedback shapes later work. A continuous identity and direct conversation distinguish dots from transient Task subagents. [Announcement](https://openai.com/index/introducing-dots/)
- **UNVERIFIED:** No public dot publishing, installation or marketplace is documented; specialist-dot setup is an enterprise pilot. [Announcement](https://openai.com/index/introducing-dots/)
- **REPORTED:** Early testers like ongoing responsibilities and integrations, but users report weak proactivity and confusing usage limits. These are individual experiences. [Demo](https://www.youtube.com/watch?v=ld9C89W5S3E) · [Review roundup](https://emergent.sh/learn/chatgpt-dots-review) · [Limit report](https://community.openai.com/t/don-t-stay-on-calls-with-chatgpt-dots-for-long-periods-you-can-hit-the-limit-on-pro-5x/1402443)

## Claude duet

- **CONFIRMED:** Anthropic announced **Claude Duet** October 21, 2026: a proactive assistant **app**, not a named Claude Code subagent. Research preview is waitlisted for US Pro, Max and Ultra on iOS, Android and claude.ai; it shares Claude usage limits. [Announcement](https://claude.com/resources/articles/claude-duet)
- **CONFIRMED:** Duet has one ongoing conversation and inherits Claude memory, skills and connected apps. Users give tasks conversationally, specify what to monitor and how often, and approve consequential actions. It uses Opus 5.5 and Claude Marketplace connectors. No Duet definition file, independent roster or model selector is described. [Announcement](https://claude.com/resources/articles/claude-duet)
- **CONFIRMED:** A virtual machine/browser runs tasks after the user's device is off. Duet checks connected accounts every few hours, briefs users each morning, and sends notifications for reviews. Users type or speak to it directly. This ongoing proactive assistant differs from a parent-called Task subagent. [Announcement](https://claude.com/resources/articles/claude-duet)
- **UNVERIFIED:** The connector marketplace does not establish a way to publish or install a Duet identity/configuration. [Announcement](https://claude.com/resources/articles/claude-duet)
- **CONFIRMED (attributed testers):** Early users praised unprompted calendar fixes and briefs. **REPORTED:** Reviewers dislike the US waitlist, shared caps and slow background work. [Tester accounts](https://claude.com/resources/articles/claude-duet) · [Review](https://www.eesel.ai/blog/claude-duet-review)

## Comparison table

| Feature | Unit | Definition format | Run mode | Direct chat | Persistence | Sharing | Availability |
|---|---|---|---|---|---|---|---|
| [Grok Bot — CONFIRMED](https://docs.x.ai/grok-bot/bots) | Named Bot | UI + chat rules | Cloud, background, parallel | Yes | Identity, memory, routines | [Public/team templates](https://x.ai/bot/guides/templates-for-grok-bot) | [Paid beta, desktop/iOS](https://x.ai/news/introducing-grok-bot) |
| [OpenAI dots — CONFIRMED](https://openai.com/index/introducing-dots/) | Primary dot | ChatGPT UI, apps, Custom Rules | Cloud, background, parallel projects | Chat/voice | Identity, cross-channel context | UNVERIFIED for dots | Pro/Business Premium rollout; enterprise beta |
| [Claude Duet — CONFIRMED](https://claude.com/resources/articles/claude-duet) | One Duet thread | Claude context + messages | Cloud VM, background | Text/voice | Ongoing thread, inherited memory | UNVERIFIED for Duet | US waitlist; Pro/Max/Ultra |

## Wider trend

- **CONFIRMED:** Cloud computers let work survive closed laptops. [Grok Bot](https://x.ai/news/introducing-grok-bot) · [dots](https://openai.com/index/introducing-dots/)
- **CONFIRMED:** Durable named workers and conversations are becoming delegation units. [Grok Bot design](https://x.ai/news/designing-grok-bot)
- **CONFIRMED:** Users chat with an agent during ongoing work. [dots](https://openai.com/index/introducing-dots/) · [Duet](https://claude.com/resources/articles/claude-duet)
- **CONFIRMED:** Routines and periodic checks drive work without a fresh prompt. [Grok Bot](https://x.ai/news/introducing-grok-bot) · [Duet](https://claude.com/resources/articles/claude-duet)
- **CONFIRMED:** Several workers or projects can proceed simultaneously. [Grok Bot](https://x.ai/news/introducing-grok-bot) · [dots](https://openai.com/index/introducing-dots/)
- **CONFIRMED:** Access rules and approvals govern consequential actions. [dots](https://openai.com/index/introducing-dots/) · [Duet](https://claude.com/resources/articles/claude-duet)
- **CONFIRMED:** Sharing varies by product; Grok Bot offers templates, while cited dots/Duet announcements offer no equivalent. [Grok templates](https://x.ai/bot/guides/templates-for-grok-bot) · [dots](https://openai.com/index/introducing-dots/) · [Duet](https://claude.com/resources/articles/claude-duet)

## Open points

- **UNVERIFIED:** Public technical schemas and export formats for dots and Duet are not specified in cited launch material. [OpenAI](https://openai.com/index/introducing-dots/) · [Anthropic](https://claude.com/resources/articles/claude-duet)
- **UNVERIFIED:** Sampled user comments do not establish representative reliability or satisfaction. [Discussion](https://www.reddit.com/r/AI_Agents/comments/1xhtp7v/grok_bot_muse_dots_gemini_duet_five_bigtech)


