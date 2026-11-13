# Electron visual check: AI team builder skill flow

Status: not run by an agent. The task rules forbid `serve`, `dev`, `e2e` and `package` targets.
A person runs these steps. No screenshot of a rendered app exists yet.

## Prepare

1. Use the branch `feat/setup-stack-skills` in its worktree.
2. Start the Electron app the way you normally start it for a workspace.
3. Open a workspace that has Angular and Nx dependencies (this repository is a good case).

## Steps

1. Open the setup hub. Open the AI team builder.
2. Type a short intent, for example "A research team". Press Submit.
   - Expect: the skill review stage. Recommendations of the detected tech stack show first, each
     with evidence. Search is a secondary input.
   - Expect: Angular and Nx skills. No NestJS, Fastify or Vitest skill.
3. Read the project guidance. Expect facts with labels `follow`, `tolerate`, `do not copy`.
4. Type in the search field. Expect a debounce and results below the recommendations.
5. Select one skill without scripts. Press the continue action.
   - Expect: a preview. A skill without scripts needs no approval.
6. Select a third-party skill with scripts. Continue.
   - Expect: consent modal. The skill with scripts is unchecked. The install button is blocked
     until you check it. Files, script files and content hash show as text.
7. Approve. Install. Expect: chat opens with the team builder.
8. Failure case: turn off the network, repeat step 6, press install. Expect: the failed skill name,
   the list of installed skills, no chat launch.
9. Press Back during the launch. Expect: no error, no stuck spinner, attachments kept.
10. Change the workspace while the review stage is open. Expect: reset to the intent stage with
    the message "Workspace changed. Review skills again."

## Record

For each step write Pass or Fail. Take a screenshot at the widths 760 px and 1280 px for steps 2,
6 and 8. Keep screenshots out of the repository (public repository).
