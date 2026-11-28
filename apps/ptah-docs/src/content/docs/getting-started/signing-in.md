---
title: Connect a provider
description: Connect an AI provider in the PtahCode desktop app.
---

Ptah needs at least one AI provider. You do not need a Ptah account. Every local capability is free and open source.

## Connect a provider

1. Open **Settings**. The **Providers** tab opens.
2. Click **Connect provider**.
3. In the **Connect a provider** list, click **Connect** next to the provider.
4. Do the step that the provider needs: paste an API key, or click the sign-in button.
5. Test the connection.

![Providers settings panel](/screenshots/providers-settings.webp)

The **Main agent** section at the top of the Providers tab shows which provider and model drive the main chat agent.

## Supported providers

| Provider                                     | How you connect                         |
| -------------------------------------------- | --------------------------------------- |
| [Claude](/providers/claude/)                 | Claude Code sign-in, or an API key      |
| [OpenAI Codex](/providers/codex/)            | **Sign in with Codex** (ChatGPT plan)   |
| [GitHub Copilot](/providers/copilot/)        | GitHub sign-in (Copilot plan)           |
| [Kimi Code](/providers/kimi-code/)           | **Sign in with Kimi Code**              |
| [Z.AI (GLM)](/providers/z-ai/)               | API key                                 |
| [OpenRouter](/providers/openrouter/)         | API key                                 |
| [Requesty](/providers/requesty/)             | API key                                 |
| [Sakana (Fugu)](/providers/sakana/)          | API key                                 |
| [Ollama](/providers/ollama/)                 | Local server, no key                    |
| [LM Studio](/providers/lm-studio/)           | Local server, no key                    |

Ptah also has Ollama Cloud, OpenCode Zen, OpenCode Go, and a custom endpoint for any Anthropic- or OpenAI-compatible server. See [Providers](/providers/).

## Where credentials are stored

- Secrets (API keys and tokens) go into `secrets.json` in the Electron user-data folder. Each value is encrypted with Electron `safeStorage`, which uses the OS keychain.
- Non-secret settings go into `~/.ptah/settings.json`.

:::caution[Linux without a keyring]
If your Linux system has no keyring, `safeStorage` cannot encrypt. Ptah then stores secrets as plain text and logs a warning. Install and unlock a keyring (for example, GNOME Keyring) to get encryption.
:::

## Next step

Go to the [Chat guide](/chat/) to send your first message, or to [Project setup](/setup/) to write an agent team for your project.
