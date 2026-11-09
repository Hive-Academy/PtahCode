# Context

User report: a Ptah CLI agent created through the CLI tools lane with a custom name
(`Glm`, `kimi code`) shows that name for a while, then the UI shows `Ptah CLI`.
Evidence: the usage/limits popover titled "Ptah CLI" for the Ollama Cloud agent named
"Glm" (Session 100% used, Weekly 42%, "Limit hit ... From error").
`ptah_agent_list` still shows the right names, so the registry has them.

Requirement: every place that shows a Ptah CLI agent's name uses the configured name.
"Ptah CLI" is only the fallback when no name exists.
