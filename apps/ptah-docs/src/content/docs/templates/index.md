---
title: Templates
description: The agent templates that PtahCode uses to generate project agents.
---

**Templates** in PtahCode are Markdown files for built-in agents. The [setup wizard](/setup/setup-wizard/) uses the active `team-leader` template to write an agent for your project. Planning, architecture, research, docs, and design use phase workflows.

## Where templates come from

The installer does not include the templates. The [content download](/plugins/plugin-storage/) gets them from the public GitHub repository into `~/.ptah/templates/agents/`.

## Shipped templates

The active orchestration template is `team-leader`. The `plan`, `architecture`, `research`, `docs`, and `design` phases cover the former definition and knowledge roles. Testing and review use `tests`, `review`, and `visual-review`.

The folder `_shared/` holds blocks that many templates include, for example the clarification protocol and the tool rules.

Implementation work runs as the `implement` phase on a subagent, CLI lane, or session.

## Next steps

- [How templates are used](/templates/using-templates/)
- [Template storage](/templates/template-storage/)
- [Creating templates](/templates/creating-templates/)
