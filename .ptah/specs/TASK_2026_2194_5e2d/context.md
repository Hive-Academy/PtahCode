# Context

Program: TASK_2026_977_0876. E2E test on main 82fb58bdd: in a fresh workspace `/orchestrate` was not installed. SDK query logged pluginCount 0. Bundled plugins are opt-in (plugin-loader.service.ts:12). See e2e-triage.md Q1.

User decision (2026-11-15): enable ptah-core by default for new workspaces. The user can still turn it off in Plugins.
