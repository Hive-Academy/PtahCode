READ-ONLY task in the repository at your working directory. Change no file. Never commit or push. Do not run build, test, lint, nx or npm commands. Answer the five questions below from the code. Give each answer in at most six lines with `file:line` references. Final reply: the five answers, nothing else.

Q1. Which files implement the `ptah_read_symbol` MCP tool? What is its maximum line limit, and what does it print when the output is cut? Also report the current `git status` of the repository in one line.

Q2. Where is `GrepArgsSchema` defined and which keys does it accept? List every file under `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/` that uses `workspaceRoot`, with one line number each.

Q3. Where is the CLI lane policy constant `PTAH_LANE_POLICY` defined, what is its byte limit, and which sentence tells a lane what to do when a Ptah tool is absent or fails?

Q4. Show the subject lines of the latest three commits and the number of files each changed. Does the folder `.ptah/tmp` contain any file whose name starts with `mcp-usage`? Report names and line counts only.

Q5. In `node_modules/zod/package.json`, what is the `version`? In `libs/shared/src/lib/tool-guidance/tool-substitutions.ts`, which rows name `ptah_get_diagnostics` and `ptah_grep`, and what does each say it replaces?
