---
title: Templates
description: The agent templates that PtahCode uses to generate project agents.
---

**Templates** in PtahCode are Markdown files for agent generation. No built-in agent role remains, so the [setup wizard](/setup/setup-wizard/) has no built-in template to offer. Work runs as `plan`, `research`, `design`, `architecture`, `batch`, `implement`, `tests`, `review`, and `completion` phases.

## Where templates come from

The installer does not include the templates. The [content download](/plugins/plugin-storage/) gets them from the public GitHub repository into `~/.ptah/templates/agents/`.

## Shipped templates

There are no shipped role templates. The `docs` and `visual-review` phases remain available alongside the main workflow phases.

The folder `_shared/` holds blocks that many templates include, for example the clarification protocol and the tool rules.

Implementation work runs as the `implement` phase on a subagent, CLI lane, or session.

## Next steps

- [How templates are used](/templates/using-templates/)
- [Template storage](/templates/template-storage/)
- [Creating templates](/templates/creating-templates/)
