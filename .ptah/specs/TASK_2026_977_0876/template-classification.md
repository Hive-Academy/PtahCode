## Summary

Line counts partition each template by physical line; blank lines inherit their section. `other` is retired template metadata.

| Template | Total lines | Discipline | Stack knowledge | Repository fact | Cross-reference | Other | Target phase kind(s) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `backend-developer.template.md` | 230 | 186 | 22 | 16 | 0 | 6 | implement |
| `code-logic-reviewer.template.md` | 250 | 228 | 0 | 13 | 2 | 7 | review |
| `code-style-reviewer.template.md` | 242 | 222 | 0 | 11 | 2 | 7 | review |
| `devops-engineer.template.md` | 175 | 151 | 0 | 17 | 0 | 7 | implement |
| `frontend-developer.template.md` | 247 | 200 | 24 | 17 | 0 | 6 | implement |
| `modernization-detector.template.md` | 139 | 132 | 0 | 0 | 0 | 7 | research |
| `project-manager.template.md` | 238 | 229 | 0 | 0 | 2 | 7 | plan |
| `researcher-expert.template.md` | 147 | 140 | 0 | 0 | 0 | 7 | research |
| `senior-tester.template.md` | 244 | 221 | 0 | 15 | 1 | 7 | tests |
| `software-architect.template.md` | 287 | 258 | 0 | 14 | 8 | 7 | architecture |
| `team-leader.template.md` | 535 | 521 | 0 | 0 | 7 | 7 | batch, completion |
| `technical-content-writer.template.md` | 343 | 134 | 199 | 0 | 3 | 7 | docs |
| `ui-ux-designer.template.md` | 128 | 119 | 2 | 0 | 1 | 6 | design |
| `visual-reviewer.template.md` | 304 | 284 | 0 | 13 | 0 | 7 | visual-review |

## Shared parts

| Part | Source | Included by | Classification |
| --- | --- | --- | --- |
| `clarification-protocol.md` | `clarification-protocol.md:1-3` | backend-developer, code-logic-reviewer, code-style-reviewer, devops-engineer, frontend-developer, modernization-detector, project-manager, researcher-expert, senior-tester, software-architect, team-leader, technical-content-writer, ui-ux-designer, visual-reviewer | Decision, escalation and stop protocol; discipline. |
| `cli-delegation.md` | `cli-delegation.md:1-1` | backend-developer, code-logic-reviewer, code-style-reviewer, devops-engineer, frontend-developer, modernization-detector, project-manager, researcher-expert, senior-tester, software-architect, team-leader, technical-content-writer | One-line placeholder; no substantive content. |
| `replacement-policy.md` | `replacement-policy.md:1-1` | backend-developer, devops-engineer, frontend-developer, project-manager, senior-tester, software-architect, team-leader, ui-ux-designer | One-line placeholder; no substantive content. |
| `reviewer-stance.md` | `reviewer-stance.md:1-5` | code-logic-reviewer, code-style-reviewer, visual-reviewer | Evidence, scoring and clean-verdict rules; review discipline. |
| `tooling-precedence.md` | `tooling-precedence.md:1-27` | backend-developer, code-logic-reviewer, code-style-reviewer, devops-engineer, frontend-developer, modernization-detector, project-manager, researcher-expert, senior-tester, software-architect, team-leader, technical-content-writer, ui-ux-designer, visual-reviewer | Tool priority and skill loading; general phase discipline. |

`TASK_SPEC_CONTRACT` is a derived shared block rather than an `_shared/` file (`template-partial-resolver.ts:37-41`, `template-partial-resolver.ts:95-99`). Its task artifact rules belong in phase contracts.

## backend-developer.template.md

| Section heading | Line range | Class | Destination | Note |
| --- | --- | --- | --- | --- |
| Frontmatter | `backend-developer.template.md:1-1` | discipline | implement | Role metadata and clarification variables. |
| Frontmatter | `backend-developer.template.md:2-3` | other | retire template metadata; router handles applicability | Role metadata and clarification variables. |
| Frontmatter | `backend-developer.template.md:4-4` | discipline | implement | Role metadata and clarification variables. |
| Frontmatter | `backend-developer.template.md:5-7` | stack knowledge | nestjs-backend-patterns, resilient-nestjs-patterns, ddd-architecture | Select named skill where available. |
| Frontmatter | `backend-developer.template.md:8-10` | other | retire template metadata; router handles applicability | Role metadata and clarification variables. |
| Frontmatter | `backend-developer.template.md:11-20` | discipline | implement | Role metadata and clarification variables. |
| Frontmatter | `backend-developer.template.md:21-21` | other | retire template metadata; router handles applicability | Role metadata and clarification variables. |
| Frontmatter | `backend-developer.template.md:22-31` | discipline | implement | Role metadata and clarification variables. |
| Title and shared blocks | `backend-developer.template.md:32-53` | discipline | implement | Shared policy markers and role title. |
| Role | `backend-developer.template.md:54-62` | discipline | implement | Scope and work boundaries. |
| Inputs | `backend-developer.template.md:63-86` | discipline | implement | Evidence and required inputs. |
| Method | `backend-developer.template.md:87-145` | discipline | implement | Work procedure. |
| Backend framework conventions | `backend-developer.template.md:146-164` | stack knowledge | nestjs-backend-patterns, resilient-nestjs-patterns, ddd-architecture | Select named skill where available. |
| Backend architecture patterns | `backend-developer.template.md:165-180` | repository fact | CLAUDE.md via workspace analysis | Fill from workspace analysis. |
| Output contract | `backend-developer.template.md:181-194` | discipline | implement | Artifact schema and evidence requirements. |
| Return value | `backend-developer.template.md:195-217` | discipline | implement | Completion signal. |
| Refusals | `backend-developer.template.md:218-230` | discipline | implement | Failure and stop conditions. |

## code-logic-reviewer.template.md

| Section heading | Line range | Class | Destination | Note |
| --- | --- | --- | --- | --- |
| Frontmatter | `code-logic-reviewer.template.md:1-1` | discipline | review | Role metadata and clarification variables. |
| Frontmatter | `code-logic-reviewer.template.md:2-3` | other | retire template metadata; router handles applicability | Role metadata and clarification variables. |
| Frontmatter | `code-logic-reviewer.template.md:4-4` | discipline | review | Role metadata and clarification variables. |
| Frontmatter | `code-logic-reviewer.template.md:5-5` | other | retire template metadata; router handles applicability | Routing wildcard. |
| Frontmatter | `code-logic-reviewer.template.md:6-8` | other | retire template metadata; router handles applicability | Role metadata and clarification variables. |
| Frontmatter | `code-logic-reviewer.template.md:9-16` | discipline | review | Role metadata and clarification variables. |
| Frontmatter | `code-logic-reviewer.template.md:17-17` | cross-reference | phase kind / artifact handoff | Replace named role with phase or artifact. |
| Frontmatter | `code-logic-reviewer.template.md:18-18` | other | retire template metadata; router handles applicability | Role metadata and clarification variables. |
| Frontmatter | `code-logic-reviewer.template.md:19-29` | discipline | review | Role metadata and clarification variables. |
| Title and shared blocks | `code-logic-reviewer.template.md:30-40` | discipline | review | Shared policy markers and role title. |
| Role | `code-logic-reviewer.template.md:41-52` | discipline | review | Scope and work boundaries. |
| Inputs | `code-logic-reviewer.template.md:53-69` | discipline | review | Evidence and required inputs. |
| Method | `code-logic-reviewer.template.md:70-128` | discipline | review | Work procedure. |
| Logic review focus for this repository | `code-logic-reviewer.template.md:129-141` | repository fact | CLAUDE.md via workspace analysis | Fill from workspace analysis. |
| Output contract | `code-logic-reviewer.template.md:142-234` | discipline | review | Artifact schema and evidence requirements. |
| Return value | `code-logic-reviewer.template.md:235-240` | discipline | review | Completion signal. |
| Refusals | `code-logic-reviewer.template.md:241-249` | discipline | review | Failure and stop conditions. |
| Refusals | `code-logic-reviewer.template.md:250-250` | cross-reference | phase kind / artifact handoff | Replace named role with phase or artifact. |

## code-style-reviewer.template.md

| Section heading | Line range | Class | Destination | Note |
| --- | --- | --- | --- | --- |
| Frontmatter | `code-style-reviewer.template.md:1-1` | discipline | review | Role metadata and clarification variables. |
| Frontmatter | `code-style-reviewer.template.md:2-3` | other | retire template metadata; router handles applicability | Role metadata and clarification variables. |
| Frontmatter | `code-style-reviewer.template.md:4-4` | discipline | review | Role metadata and clarification variables. |
| Frontmatter | `code-style-reviewer.template.md:5-5` | other | retire template metadata; router handles applicability | Routing wildcard. |
| Frontmatter | `code-style-reviewer.template.md:6-8` | other | retire template metadata; router handles applicability | Role metadata and clarification variables. |
| Frontmatter | `code-style-reviewer.template.md:9-16` | discipline | review | Role metadata and clarification variables. |
| Frontmatter | `code-style-reviewer.template.md:17-17` | cross-reference | phase kind / artifact handoff | Replace named role with phase or artifact. |
| Frontmatter | `code-style-reviewer.template.md:18-18` | other | retire template metadata; router handles applicability | Role metadata and clarification variables. |
| Frontmatter | `code-style-reviewer.template.md:19-29` | discipline | review | Role metadata and clarification variables. |
| Title and shared blocks | `code-style-reviewer.template.md:30-48` | discipline | review | Shared policy markers and role title. |
| Role | `code-style-reviewer.template.md:49-62` | discipline | review | Scope and work boundaries. |
| Inputs | `code-style-reviewer.template.md:63-77` | discipline | review | Evidence and required inputs. |
| Method | `code-style-reviewer.template.md:78-129` | discipline | review | Work procedure. |
| Style review focus for this repository | `code-style-reviewer.template.md:130-140` | repository fact | CLAUDE.md via workspace analysis | Fill from workspace analysis. |
| Output contract | `code-style-reviewer.template.md:141-227` | discipline | review | Artifact schema and evidence requirements. |
| Return value | `code-style-reviewer.template.md:228-233` | discipline | review | Completion signal. |
| Refusals | `code-style-reviewer.template.md:234-241` | discipline | review | Failure and stop conditions. |
| Refusals | `code-style-reviewer.template.md:242-242` | cross-reference | phase kind / artifact handoff | Replace named role with phase or artifact. |

## devops-engineer.template.md

| Section heading | Line range | Class | Destination | Note |
| --- | --- | --- | --- | --- |
| Frontmatter | `devops-engineer.template.md:1-1` | discipline | implement | Role metadata and clarification variables. |
| Frontmatter | `devops-engineer.template.md:2-3` | other | retire template metadata; router handles applicability | Role metadata and clarification variables. |
| Frontmatter | `devops-engineer.template.md:4-4` | discipline | implement | Role metadata and clarification variables. |
| Frontmatter | `devops-engineer.template.md:5-5` | other | retire template metadata; router handles applicability | Routing wildcard. |
| Frontmatter | `devops-engineer.template.md:6-8` | other | retire template metadata; router handles applicability | Role metadata and clarification variables. |
| Frontmatter | `devops-engineer.template.md:9-18` | discipline | implement | Role metadata and clarification variables. |
| Frontmatter | `devops-engineer.template.md:19-19` | other | retire template metadata; router handles applicability | Role metadata and clarification variables. |
| Frontmatter | `devops-engineer.template.md:20-30` | discipline | implement | Role metadata and clarification variables. |
| Title and shared blocks | `devops-engineer.template.md:31-43` | discipline | implement | Shared policy markers and role title. |
| Role | `devops-engineer.template.md:44-51` | discipline | implement | Scope and work boundaries. |
| Inputs | `devops-engineer.template.md:52-68` | discipline | implement | Evidence and required inputs. |
| Method | `devops-engineer.template.md:69-110` | discipline | implement | Work procedure. |
| Build and deploy surface | `devops-engineer.template.md:111-127` | repository fact | CLAUDE.md via workspace analysis | Fill from workspace analysis. |
| Output contract | `devops-engineer.template.md:128-141` | discipline | implement | Artifact schema and evidence requirements. |
| Return value | `devops-engineer.template.md:142-167` | discipline | implement | Completion signal. |
| Refusals | `devops-engineer.template.md:168-175` | discipline | implement | Failure and stop conditions. |

## frontend-developer.template.md

| Section heading | Line range | Class | Destination | Note |
| --- | --- | --- | --- | --- |
| Frontmatter | `frontend-developer.template.md:1-1` | discipline | implement | Role metadata and clarification variables. |
| Frontmatter | `frontend-developer.template.md:2-3` | other | retire template metadata; router handles applicability | Role metadata and clarification variables. |
| Frontmatter | `frontend-developer.template.md:4-4` | discipline | implement | Role metadata and clarification variables. |
| Frontmatter | `frontend-developer.template.md:5-7` | stack knowledge | angular-frontend-patterns | Select named skill where available. |
| Frontmatter | `frontend-developer.template.md:8-9` | other | retire template metadata; router handles applicability | Role metadata and clarification variables. |
| Frontmatter | `frontend-developer.template.md:10-10` | stack knowledge | angular-frontend-patterns | Select named skill where available. |
| Frontmatter | `frontend-developer.template.md:11-11` | other | retire template metadata; router handles applicability | Role metadata and clarification variables. |
| Frontmatter | `frontend-developer.template.md:12-21` | discipline | implement | Role metadata and clarification variables. |
| Frontmatter | `frontend-developer.template.md:22-22` | other | retire template metadata; router handles applicability | Role metadata and clarification variables. |
| Frontmatter | `frontend-developer.template.md:23-32` | discipline | implement | Role metadata and clarification variables. |
| Title and shared blocks | `frontend-developer.template.md:33-54` | discipline | implement | Shared policy markers and role title. |
| Role | `frontend-developer.template.md:55-63` | discipline | implement | Scope and work boundaries. |
| Inputs | `frontend-developer.template.md:64-91` | discipline | implement | Evidence and required inputs. |
| Method | `frontend-developer.template.md:92-155` | discipline | implement | Work procedure. |
| Frontend framework conventions | `frontend-developer.template.md:156-175` | stack knowledge | angular-frontend-patterns | Select named skill where available. |
| Frontend architecture patterns | `frontend-developer.template.md:176-192` | repository fact | CLAUDE.md via workspace analysis | Fill from workspace analysis. |
| Output contract | `frontend-developer.template.md:193-207` | discipline | implement | Artifact schema and evidence requirements. |
| Return value | `frontend-developer.template.md:208-234` | discipline | implement | Completion signal. |
| Refusals | `frontend-developer.template.md:235-247` | discipline | implement | Failure and stop conditions. |

## modernization-detector.template.md

| Section heading | Line range | Class | Destination | Note |
| --- | --- | --- | --- | --- |
| Frontmatter | `modernization-detector.template.md:1-1` | discipline | research | Role metadata and clarification variables. |
| Frontmatter | `modernization-detector.template.md:2-3` | other | retire template metadata; router handles applicability | Role metadata and clarification variables. |
| Frontmatter | `modernization-detector.template.md:4-4` | discipline | research | Role metadata and clarification variables. |
| Frontmatter | `modernization-detector.template.md:5-5` | other | retire template metadata; router handles applicability | Routing wildcard. |
| Frontmatter | `modernization-detector.template.md:6-8` | other | retire template metadata; router handles applicability | Role metadata and clarification variables. |
| Frontmatter | `modernization-detector.template.md:9-16` | discipline | research | Role metadata and clarification variables. |
| Frontmatter | `modernization-detector.template.md:17-17` | other | retire template metadata; router handles applicability | Role metadata and clarification variables. |
| Frontmatter | `modernization-detector.template.md:18-28` | discipline | research | Role metadata and clarification variables. |
| Title and shared blocks | `modernization-detector.template.md:29-42` | discipline | research | Shared policy markers and role title. |
| Role | `modernization-detector.template.md:43-54` | discipline | research | Scope and work boundaries. |
| Inputs | `modernization-detector.template.md:55-67` | discipline | research | Evidence and required inputs. |
| Method | `modernization-detector.template.md:68-93` | discipline | research | Work procedure. |
| Output contract | `modernization-detector.template.md:94-128` | discipline | research | Artifact schema and evidence requirements. |
| Return value | `modernization-detector.template.md:129-132` | discipline | research | Completion signal. |
| Refusals | `modernization-detector.template.md:133-139` | discipline | research | Failure and stop conditions. |

## project-manager.template.md

| Section heading | Line range | Class | Destination | Note |
| --- | --- | --- | --- | --- |
| Frontmatter | `project-manager.template.md:1-1` | discipline | plan | Role metadata and clarification variables. |
| Frontmatter | `project-manager.template.md:2-3` | other | retire template metadata; router handles applicability | Role metadata and clarification variables. |
| Frontmatter | `project-manager.template.md:4-4` | discipline | plan | Role metadata and clarification variables. |
| Frontmatter | `project-manager.template.md:5-5` | other | retire template metadata; router handles applicability | Routing wildcard. |
| Frontmatter | `project-manager.template.md:6-8` | other | retire template metadata; router handles applicability | Role metadata and clarification variables. |
| Frontmatter | `project-manager.template.md:9-19` | discipline | plan | Role metadata and clarification variables. |
| Frontmatter | `project-manager.template.md:20-20` | other | retire template metadata; router handles applicability | Role metadata and clarification variables. |
| Frontmatter | `project-manager.template.md:21-30` | discipline | plan | Role metadata and clarification variables. |
| Title and shared blocks | `project-manager.template.md:31-47` | discipline | plan | Shared policy markers and role title. |
| Role | `project-manager.template.md:48-55` | discipline | plan | Scope and work boundaries. |
| Inputs | `project-manager.template.md:56-71` | discipline | plan | Evidence and required inputs. |
| Method | `project-manager.template.md:72-107` | discipline | plan | Work procedure. |
| Output contract | `project-manager.template.md:108-185` | discipline | plan | Artifact schema and evidence requirements. |
| Output contract | `project-manager.template.md:186-187` | cross-reference | phase kind / artifact handoff | Replace named role with phase or artifact. |
| Output contract | `project-manager.template.md:188-209` | discipline | plan | Artifact schema and evidence requirements. |
| Return value | `project-manager.template.md:210-217` | discipline | plan | Completion signal. |
| Refusals | `project-manager.template.md:218-238` | discipline | plan | Failure and stop conditions. |

## researcher-expert.template.md

| Section heading | Line range | Class | Destination | Note |
| --- | --- | --- | --- | --- |
| Frontmatter | `researcher-expert.template.md:1-1` | discipline | research | Role metadata and clarification variables. |
| Frontmatter | `researcher-expert.template.md:2-3` | other | retire template metadata; router handles applicability | Role metadata and clarification variables. |
| Frontmatter | `researcher-expert.template.md:4-4` | discipline | research | Role metadata and clarification variables. |
| Frontmatter | `researcher-expert.template.md:5-5` | other | retire template metadata; router handles applicability | Routing wildcard. |
| Frontmatter | `researcher-expert.template.md:6-8` | other | retire template metadata; router handles applicability | Role metadata and clarification variables. |
| Frontmatter | `researcher-expert.template.md:9-18` | discipline | research | Role metadata and clarification variables. |
| Frontmatter | `researcher-expert.template.md:19-19` | other | retire template metadata; router handles applicability | Role metadata and clarification variables. |
| Frontmatter | `researcher-expert.template.md:20-29` | discipline | research | Role metadata and clarification variables. |
| Title and shared blocks | `researcher-expert.template.md:30-43` | discipline | research | Shared policy markers and role title. |
| Role | `researcher-expert.template.md:44-50` | discipline | research | Scope and work boundaries. |
| Inputs | `researcher-expert.template.md:51-60` | discipline | research | Evidence and required inputs. |
| Method | `researcher-expert.template.md:61-80` | discipline | research | Work procedure. |
| Output contract | `researcher-expert.template.md:81-125` | discipline | research | Artifact schema and evidence requirements. |
| Return value | `researcher-expert.template.md:126-133` | discipline | research | Completion signal. |
| Refusals | `researcher-expert.template.md:134-147` | discipline | research | Failure and stop conditions. |

## senior-tester.template.md

| Section heading | Line range | Class | Destination | Note |
| --- | --- | --- | --- | --- |
| Frontmatter | `senior-tester.template.md:1-1` | discipline | tests | Role metadata and clarification variables. |
| Frontmatter | `senior-tester.template.md:2-3` | other | retire template metadata; router handles applicability | Role metadata and clarification variables. |
| Frontmatter | `senior-tester.template.md:4-4` | discipline | tests | Role metadata and clarification variables. |
| Frontmatter | `senior-tester.template.md:5-5` | other | retire template metadata; router handles applicability | Routing wildcard. |
| Frontmatter | `senior-tester.template.md:6-8` | other | retire template metadata; router handles applicability | Role metadata and clarification variables. |
| Frontmatter | `senior-tester.template.md:9-18` | discipline | tests | Role metadata and clarification variables. |
| Frontmatter | `senior-tester.template.md:19-19` | other | retire template metadata; router handles applicability | Role metadata and clarification variables. |
| Frontmatter | `senior-tester.template.md:20-29` | discipline | tests | Role metadata and clarification variables. |
| Title and shared blocks | `senior-tester.template.md:30-46` | discipline | tests | Shared policy markers and role title. |
| Role | `senior-tester.template.md:47-55` | discipline | tests | Scope and work boundaries. |
| Inputs | `senior-tester.template.md:56-74` | discipline | tests | Evidence and required inputs. |
| Method | `senior-tester.template.md:75-111` | discipline | tests | Work procedure. |
| Test infrastructure in this repository | `senior-tester.template.md:112-126` | repository fact | CLAUDE.md via workspace analysis | Fill from workspace analysis. |
| Escalation protocol | `senior-tester.template.md:127-160` | discipline | tests | Classify content of this section. |
| Escalation protocol | `senior-tester.template.md:161-161` | cross-reference | phase kind / artifact handoff | Replace named role with phase or artifact. |
| Escalation protocol | `senior-tester.template.md:162-171` | discipline | tests | Classify content of this section. |
| Output contract | `senior-tester.template.md:172-214` | discipline | tests | Artifact schema and evidence requirements. |
| Return value | `senior-tester.template.md:215-226` | discipline | tests | Completion signal. |
| Refusals | `senior-tester.template.md:227-244` | discipline | tests | Failure and stop conditions. |

## software-architect.template.md

| Section heading | Line range | Class | Destination | Note |
| --- | --- | --- | --- | --- |
| Frontmatter | `software-architect.template.md:1-1` | discipline | architecture | Role metadata and clarification variables. |
| Frontmatter | `software-architect.template.md:2-3` | other | retire template metadata; router handles applicability | Role metadata and clarification variables. |
| Frontmatter | `software-architect.template.md:4-4` | discipline | architecture | Role metadata and clarification variables. |
| Frontmatter | `software-architect.template.md:5-5` | other | retire template metadata; router handles applicability | Routing wildcard. |
| Frontmatter | `software-architect.template.md:6-8` | other | retire template metadata; router handles applicability | Role metadata and clarification variables. |
| Frontmatter | `software-architect.template.md:9-12` | discipline | architecture | Role metadata and clarification variables. |
| Frontmatter | `software-architect.template.md:13-13` | cross-reference | phase kind / artifact handoff | Replace named role with phase or artifact. |
| Frontmatter | `software-architect.template.md:14-19` | discipline | architecture | Role metadata and clarification variables. |
| Frontmatter | `software-architect.template.md:20-20` | cross-reference | phase kind / artifact handoff | Replace named role with phase or artifact. |
| Frontmatter | `software-architect.template.md:21-21` | discipline | architecture | Role metadata and clarification variables. |
| Frontmatter | `software-architect.template.md:22-22` | other | retire template metadata; router handles applicability | Role metadata and clarification variables. |
| Frontmatter | `software-architect.template.md:23-33` | discipline | architecture | Role metadata and clarification variables. |
| Title and shared blocks | `software-architect.template.md:34-58` | discipline | architecture | Shared policy markers and role title. |
| Role | `software-architect.template.md:59-67` | discipline | architecture | Scope and work boundaries. |
| Inventory-only mode | `software-architect.template.md:68-69` | discipline | architecture | Classify content of this section. |
| Inventory-only mode | `software-architect.template.md:70-70` | cross-reference | phase kind / artifact handoff | Replace named role with phase or artifact. |
| Inventory-only mode | `software-architect.template.md:71-93` | discipline | architecture | Classify content of this section. |
| Inputs | `software-architect.template.md:94-100` | discipline | architecture | Evidence and required inputs. |
| Inputs | `software-architect.template.md:101-101` | cross-reference | phase kind / artifact handoff | Replace named role with phase or artifact. |
| Inputs | `software-architect.template.md:102-108` | discipline | architecture | Evidence and required inputs. |
| Inputs | `software-architect.template.md:109-109` | cross-reference | phase kind / artifact handoff | Replace named role with phase or artifact. |
| Inputs | `software-architect.template.md:110-121` | discipline | architecture | Evidence and required inputs. |
| Method | `software-architect.template.md:122-157` | discipline | architecture | Work procedure. |
| Method | `software-architect.template.md:158-158` | cross-reference | phase kind / artifact handoff | Replace named role with phase or artifact. |
| Method | `software-architect.template.md:159-161` | discipline | architecture | Work procedure. |
| Existing patterns in this repository | `software-architect.template.md:162-175` | repository fact | CLAUDE.md via workspace analysis | Fill from workspace analysis. |
| Output contract | `software-architect.template.md:176-241` | discipline | architecture | Artifact schema and evidence requirements. |
| Output contract | `software-architect.template.md:242-242` | cross-reference | phase kind / artifact handoff | Replace named role with phase or artifact. |
| Output contract | `software-architect.template.md:243-259` | discipline | architecture | Artifact schema and evidence requirements. |
| Return value | `software-architect.template.md:260-268` | discipline | architecture | Completion signal. |
| Refusals | `software-architect.template.md:269-277` | discipline | architecture | Failure and stop conditions. |
| Refusals | `software-architect.template.md:278-278` | cross-reference | phase kind / artifact handoff | Replace named role with phase or artifact. |
| Refusals | `software-architect.template.md:279-287` | discipline | architecture | Failure and stop conditions. |

## team-leader.template.md

| Section heading | Line range | Class | Destination | Note |
| --- | --- | --- | --- | --- |
| Frontmatter | `team-leader.template.md:1-1` | discipline | batch, completion | Role metadata and clarification variables. |
| Frontmatter | `team-leader.template.md:2-3` | other | retire template metadata; router handles applicability | Role metadata and clarification variables. |
| Frontmatter | `team-leader.template.md:4-4` | discipline | batch, completion | Role metadata and clarification variables. |
| Frontmatter | `team-leader.template.md:5-5` | other | retire template metadata; router handles applicability | Routing wildcard. |
| Frontmatter | `team-leader.template.md:6-8` | other | retire template metadata; router handles applicability | Role metadata and clarification variables. |
| Frontmatter | `team-leader.template.md:9-19` | discipline | batch, completion | Role metadata and clarification variables. |
| Frontmatter | `team-leader.template.md:20-20` | other | retire template metadata; router handles applicability | Role metadata and clarification variables. |
| Frontmatter | `team-leader.template.md:21-31` | discipline | batch, completion | Role metadata and clarification variables. |
| Title and shared blocks | `team-leader.template.md:32-48` | discipline | batch, completion | Shared policy markers and role title. |
| Role | `team-leader.template.md:49-57` | discipline | batch, completion | Scope and work boundaries. |
| Inputs | `team-leader.template.md:58-80` | discipline | batch, completion | Evidence and required inputs. |
| Operating modes | `team-leader.template.md:81-92` | discipline | batch, completion | Classify content of this section. |
| Lean orchestration rules | `team-leader.template.md:93-113` | discipline | batch, completion | Shared orchestration and review constraints. |
| Mode 1 - Decomposition | `team-leader.template.md:114-140` | discipline | batch | Validate plan and prepare batch artifact. |
| Mode 1 - Decomposition | `team-leader.template.md:141-141` | cross-reference | phase kind / artifact handoff | Replace named role with phase or artifact. |
| Mode 1 - Decomposition | `team-leader.template.md:142-273` | discipline | batch | Write and route self-contained batches. |
| Mode 2 - Verify and commit | `team-leader.template.md:274-348` | discipline | orchestrator acceptance step | Checks, review gate, commit, state update. |
| Mode 3 - Completion | `team-leader.template.md:349-375` | discipline | completion | Audit parity and completion evidence. |
| Mode 3 - Completion | `team-leader.template.md:376-376` | cross-reference | phase kind / artifact handoff | Replace visual reviewer with visual-review phase. |
| Mode 3 - Completion | `team-leader.template.md:377-381` | discipline | completion | Audit visual and review evidence. |
| Mode 3 - Completion | `team-leader.template.md:382-382` | cross-reference | phase kind / artifact handoff | Replace visual reviewer with visual-review phase. |
| Mode 3 - Completion | `team-leader.template.md:383-392` | discipline | completion | Final parity decision. |
| Return value | `team-leader.template.md:393-421` | discipline | batch, completion | Completion signal. |
| Return value | `team-leader.template.md:422-423` | cross-reference | phase kind / artifact handoff | Replace named role with phase or artifact. |
| Return value | `team-leader.template.md:424-452` | discipline | batch, completion | Completion signal. |
| Return value | `team-leader.template.md:453-453` | cross-reference | phase kind / artifact handoff | Replace named role with phase or artifact. |
| Return value | `team-leader.template.md:454-493` | discipline | batch, completion | Completion signal. |
| Status vocabulary | `team-leader.template.md:494-505` | discipline | batch, completion | Classify content of this section. |
| Refusals | `team-leader.template.md:506-523` | discipline | batch, completion | Failure and stop conditions. |
| Refusals | `team-leader.template.md:524-524` | cross-reference | phase kind / artifact handoff | Replace named role with phase or artifact. |
| Refusals | `team-leader.template.md:525-535` | discipline | batch, completion | Failure and stop conditions. |

## technical-content-writer.template.md

| Section heading | Line range | Class | Destination | Note |
| --- | --- | --- | --- | --- |
| Frontmatter | `technical-content-writer.template.md:1-1` | discipline | docs | Role metadata and clarification variables. |
| Frontmatter | `technical-content-writer.template.md:2-3` | other | retire template metadata; router handles applicability | Role metadata and clarification variables. |
| Frontmatter | `technical-content-writer.template.md:4-4` | discipline | docs | Role metadata and clarification variables. |
| Frontmatter | `technical-content-writer.template.md:5-5` | other | retire template metadata; router handles applicability | Routing wildcard. |
| Frontmatter | `technical-content-writer.template.md:6-8` | other | retire template metadata; router handles applicability | Role metadata and clarification variables. |
| Frontmatter | `technical-content-writer.template.md:9-16` | discipline | docs | Role metadata and clarification variables. |
| Frontmatter | `technical-content-writer.template.md:17-17` | other | retire template metadata; router handles applicability | Role metadata and clarification variables. |
| Frontmatter | `technical-content-writer.template.md:18-27` | discipline | docs | Role metadata and clarification variables. |
| Title and shared blocks | `technical-content-writer.template.md:28-41` | discipline | docs | Shared policy markers and role title. |
| Role | `technical-content-writer.template.md:42-49` | discipline | docs | Scope and work boundaries. |
| Inputs | `technical-content-writer.template.md:50-62` | discipline | docs | Evidence and required inputs. |
| Inputs | `technical-content-writer.template.md:63-63` | cross-reference | phase kind / artifact handoff | Replace named role with phase or artifact. |
| Inputs | `technical-content-writer.template.md:64-73` | discipline | docs | Evidence and required inputs. |
| Method | `technical-content-writer.template.md:74-87` | discipline | docs | Work procedure. |
| Landing pages | `technical-content-writer.template.md:88-128` | stack knowledge | technical-content-writer | Select named skill where available. |
| Blog posts | `technical-content-writer.template.md:129-210` | stack knowledge | technical-content-writer | Select named skill where available. |
| Documentation | `technical-content-writer.template.md:211-228` | stack knowledge | technical-content-writer | Select named skill where available. |
| Inputs | `technical-content-writer.template.md:229-253` | discipline | docs | Evidence and required inputs. |
| Video scripts | `technical-content-writer.template.md:254-311` | stack knowledge | technical-content-writer | Select named skill where available. |
| Output contract | `technical-content-writer.template.md:312-325` | discipline | docs | Artifact schema and evidence requirements. |
| Output contract | `technical-content-writer.template.md:326-326` | cross-reference | phase kind / artifact handoff | Replace named role with phase or artifact. |
| Output contract | `technical-content-writer.template.md:327-329` | discipline | docs | Artifact schema and evidence requirements. |
| Output contract | `technical-content-writer.template.md:330-330` | cross-reference | phase kind / artifact handoff | Replace named role with phase or artifact. |
| Output contract | `technical-content-writer.template.md:331-331` | discipline | docs | Artifact schema and evidence requirements. |
| Return value | `technical-content-writer.template.md:332-336` | discipline | docs | Completion signal. |
| Refusals | `technical-content-writer.template.md:337-343` | discipline | docs | Failure and stop conditions. |

## ui-ux-designer.template.md

| Section heading | Line range | Class | Destination | Note |
| --- | --- | --- | --- | --- |
| Frontmatter | `ui-ux-designer.template.md:1-1` | discipline | design | Role metadata and clarification variables. |
| Frontmatter | `ui-ux-designer.template.md:2-3` | other | retire template metadata; router handles applicability | Role metadata and clarification variables. |
| Frontmatter | `ui-ux-designer.template.md:4-4` | discipline | design | Role metadata and clarification variables. |
| Frontmatter | `ui-ux-designer.template.md:5-5` | stack knowledge | ui-ux-designer | Select named skill where available. |
| Frontmatter | `ui-ux-designer.template.md:6-7` | other | retire template metadata; router handles applicability | Role metadata and clarification variables. |
| Frontmatter | `ui-ux-designer.template.md:8-8` | stack knowledge | ui-ux-designer | Select named skill where available. |
| Frontmatter | `ui-ux-designer.template.md:9-9` | other | retire template metadata; router handles applicability | Role metadata and clarification variables. |
| Frontmatter | `ui-ux-designer.template.md:10-16` | discipline | design | Role metadata and clarification variables. |
| Frontmatter | `ui-ux-designer.template.md:17-17` | cross-reference | phase kind / artifact handoff | Replace named role with phase or artifact. |
| Frontmatter | `ui-ux-designer.template.md:18-18` | other | retire template metadata; router handles applicability | Role metadata and clarification variables. |
| Frontmatter | `ui-ux-designer.template.md:19-28` | discipline | design | Role metadata and clarification variables. |
| Title and shared blocks | `ui-ux-designer.template.md:29-42` | discipline | design | Shared policy markers and role title. |
| Role | `ui-ux-designer.template.md:43-48` | discipline | design | Scope and work boundaries. |
| Inputs | `ui-ux-designer.template.md:49-72` | discipline | design | Evidence and required inputs. |
| Method | `ui-ux-designer.template.md:73-99` | discipline | design | Work procedure. |
| Output contract | `ui-ux-designer.template.md:100-113` | discipline | design | Artifact schema and evidence requirements. |
| Return value | `ui-ux-designer.template.md:114-118` | discipline | design | Completion signal. |
| Refusals | `ui-ux-designer.template.md:119-128` | discipline | design | Failure and stop conditions. |

## visual-reviewer.template.md

| Section heading | Line range | Class | Destination | Note |
| --- | --- | --- | --- | --- |
| Frontmatter | `visual-reviewer.template.md:1-1` | discipline | visual-review | Role metadata and clarification variables. |
| Frontmatter | `visual-reviewer.template.md:2-3` | other | retire template metadata; router handles applicability | Role metadata and clarification variables. |
| Frontmatter | `visual-reviewer.template.md:4-4` | discipline | visual-review | Role metadata and clarification variables. |
| Frontmatter | `visual-reviewer.template.md:5-5` | other | retire template metadata; router handles applicability | Routing wildcard. |
| Frontmatter | `visual-reviewer.template.md:6-8` | other | retire template metadata; router handles applicability | Role metadata and clarification variables. |
| Frontmatter | `visual-reviewer.template.md:9-16` | discipline | visual-review | Role metadata and clarification variables. |
| Frontmatter | `visual-reviewer.template.md:17-17` | other | retire template metadata; router handles applicability | Role metadata and clarification variables. |
| Frontmatter | `visual-reviewer.template.md:18-29` | discipline | visual-review | Role metadata and clarification variables. |
| Title and shared blocks | `visual-reviewer.template.md:30-40` | discipline | visual-review | Shared policy markers and role title. |
| Role | `visual-reviewer.template.md:41-55` | discipline | visual-review | Scope and work boundaries. |
| Inputs | `visual-reviewer.template.md:56-79` | discipline | visual-review | Evidence and required inputs. |
| Method | `visual-reviewer.template.md:80-192` | discipline | visual-review | Work procedure. |
| Visual review focus for this repository | `visual-reviewer.template.md:193-205` | repository fact | CLAUDE.md via workspace analysis | Fill from workspace analysis. |
| Output contract | `visual-reviewer.template.md:206-290` | discipline | visual-review | Artifact schema and evidence requirements. |
| Return value | `visual-reviewer.template.md:291-295` | discipline | visual-review | Completion signal. |
| Refusals | `visual-reviewer.template.md:296-304` | discipline | visual-review | Failure and stop conditions. |

## Template variables

| Variable / placeholder | Source | Destination |
| --- | --- | --- |
| `{{CLARIFY_TRIGGER}}` | `backend-developer.template.md:23`, `code-logic-reviewer.template.md:20`, `code-style-reviewer.template.md:20`, `devops-engineer.template.md:21`, `frontend-developer.template.md:24`, `modernization-detector.template.md:19`, `project-manager.template.md:22`, `researcher-expert.template.md:21`, `senior-tester.template.md:21`, `software-architect.template.md:24`, `team-leader.template.md:22`, `technical-content-writer.template.md:19`, `ui-ux-designer.template.md:20`, `visual-reviewer.template.md:19`; substitution defined at `template-partial-resolver.ts:31-35` | Phase clarification / review contract |
| `{{CLARIFY_ARTIFACT}}` | `backend-developer.template.md:26`, `code-logic-reviewer.template.md:23`, `code-style-reviewer.template.md:23`, `devops-engineer.template.md:24`, `frontend-developer.template.md:27`, `modernization-detector.template.md:22`, `project-manager.template.md:25`, `researcher-expert.template.md:24`, `senior-tester.template.md:24`, `software-architect.template.md:27`, `team-leader.template.md:25`, `technical-content-writer.template.md:22`, `ui-ux-designer.template.md:23`, `visual-reviewer.template.md:22`; substitution defined at `template-partial-resolver.ts:31-35` | Phase clarification / review contract |
| `{{CLARIFY_BYPASS}}` | `backend-developer.template.md:28`, `code-logic-reviewer.template.md:25`, `code-style-reviewer.template.md:25`, `devops-engineer.template.md:26`, `frontend-developer.template.md:29`, `modernization-detector.template.md:24`, `project-manager.template.md:27`, `researcher-expert.template.md:26`, `senior-tester.template.md:26`, `software-architect.template.md:29`, `team-leader.template.md:27`, `technical-content-writer.template.md:24`, `ui-ux-designer.template.md:25`, `visual-reviewer.template.md:24`; substitution defined at `template-partial-resolver.ts:31-35` | Phase clarification / review contract |
| `{{REVIEW_SUBJECT}}` | `code-logic-reviewer.template.md:27`, `code-style-reviewer.template.md:27`, `visual-reviewer.template.md:27`; substitution defined at `template-partial-resolver.ts:31-35` | Phase clarification / review contract |
| `STATIC:TOOLING_PRECEDENCE` | `backend-developer.template.md:34`, `code-logic-reviewer.template.md:32`, `code-style-reviewer.template.md:32`, `devops-engineer.template.md:33`, `frontend-developer.template.md:35`, `modernization-detector.template.md:31`, `project-manager.template.md:33`, `researcher-expert.template.md:32`, `senior-tester.template.md:32`, `software-architect.template.md:36`, `team-leader.template.md:34`, `technical-content-writer.template.md:30`, `ui-ux-designer.template.md:31`, `visual-reviewer.template.md:32`; resolver `template-partial-resolver.ts:67-74` | Phase definition / shared phase rule |
| `STATIC:TASK_SPEC_CONTRACT` | `backend-developer.template.md:36`, `code-logic-reviewer.template.md:34`, `code-style-reviewer.template.md:34`, `devops-engineer.template.md:35`, `frontend-developer.template.md:37`, `modernization-detector.template.md:34`, `project-manager.template.md:36`, `researcher-expert.template.md:35`, `senior-tester.template.md:35`, `software-architect.template.md:39`, `team-leader.template.md:37`, `technical-content-writer.template.md:33`, `ui-ux-designer.template.md:34`, `visual-reviewer.template.md:35`; resolver `template-partial-resolver.ts:67-74` | Phase definition / shared phase rule |
| `STATIC:CLARIFICATION_PROTOCOL` | `backend-developer.template.md:38`, `code-logic-reviewer.template.md:36`, `code-style-reviewer.template.md:36`, `devops-engineer.template.md:37`, `frontend-developer.template.md:39`, `modernization-detector.template.md:37`, `project-manager.template.md:39`, `researcher-expert.template.md:38`, `senior-tester.template.md:38`, `software-architect.template.md:42`, `team-leader.template.md:40`, `technical-content-writer.template.md:36`, `ui-ux-designer.template.md:37`, `visual-reviewer.template.md:38`; resolver `template-partial-resolver.ts:67-74` | Phase definition / shared phase rule |
| `STATIC:REVIEWER_STANCE` | `code-logic-reviewer.template.md:50`, `code-style-reviewer.template.md:60`, `visual-reviewer.template.md:53`; resolver `template-partial-resolver.ts:67-74` | Phase definition / shared phase rule |
| `STATIC:CLI_DELEGATION` | `backend-developer.template.md:51`, `code-logic-reviewer.template.md:38`, `code-style-reviewer.template.md:38`, `devops-engineer.template.md:41`, `frontend-developer.template.md:52`, `modernization-detector.template.md:40`, `project-manager.template.md:45`, `researcher-expert.template.md:41`, `senior-tester.template.md:44`, `software-architect.template.md:56`, `team-leader.template.md:46`, `technical-content-writer.template.md:39`; resolver `template-partial-resolver.ts:67-74` | Phase definition / shared phase rule |
| `STATIC:REPLACEMENT_POLICY` | `backend-developer.template.md:40`, `devops-engineer.template.md:39`, `frontend-developer.template.md:41`, `project-manager.template.md:42`, `senior-tester.template.md:41`, `software-architect.template.md:45`, `team-leader.template.md:43`, `ui-ux-designer.template.md:40`; resolver `template-partial-resolver.ts:67-74` | Phase definition / shared phase rule |

Runtime placeholders such as `TASK_[ID]`, `TASK_YYYY_NNN`, `<TASK_FOLDER>`, batch `[N]`, file paths, scores and verdicts are artifact instance values supplied by the phase input or task folder, not workspace facts. See `backend-developer.template.md:198`, `project-manager.template.md:115`, `technical-content-writer.template.md:314`, and `visual-reviewer.template.md:215`. Repository-specific values such as framework, tool, target and pattern names come from workspace analysis into `CLAUDE.md`; the template sections above identify their source lines.

## Cross-references between roles

The summary counts exact named-role lines as cross-reference; generic role aliases below are additional dependencies within discipline rows.

| From template | Line | Names role | Dependency | Replacement |
| --- | --- | --- | --- | --- |
| code-logic-reviewer | `code-logic-reviewer.template.md:17` | code-style-reviewer | not review naming, formatting or pattern consistency — that is code-style-reviewer. | review phase or `code-style-review.md` |
| code-logic-reviewer | `code-logic-reviewer.template.md:250` | code-style-reviewer | code-style-reviewer. | review phase or `code-style-review.md` |
| code-style-reviewer | `code-style-reviewer.template.md:17` | code-logic-reviewer | modes — that is code-logic-reviewer. | review phase or `code-logic-review.md` |
| code-style-reviewer | `code-style-reviewer.template.md:242` | code-logic-reviewer | - No duplication of runtime failure-mode findings; route those to code-logic-reviewer. | review phase or `code-logic-review.md` |
| project-manager | `project-manager.template.md:186` | researcher-expert | - Next specialist: [researcher-expert when the unknowns are external, | research phase or `research-report.md` |
| project-manager | `project-manager.template.md:187` | software-architect | software-architect when the shape is the question, a developer when neither] | architecture phase or `implementation-plan.md` |
| senior-tester | `senior-tester.template.md:161` | researcher-expert | - Owner: [researcher-expert for tooling research, or the developer who owns the | research phase or `research-report.md` |
| software-architect | `software-architect.template.md:13` | team-leader | handoff the team-leader can decompose. Use when a change crosses more than one | batch or completion phase |
| software-architect | `software-architect.template.md:20` | project-manager | project-manager, inventory the old code in parity-inventory.md and stop | plan phase or `task-description.md` |
| software-architect | `software-architect.template.md:70` | project-manager | When invoked for parity in a flow without a project-manager, write only | plan phase or `task-description.md` |
| software-architect | `software-architect.template.md:101` | researcher-expert | 3. `research-report.md` — evidence gathered by researcher-expert. | research phase or `research-report.md` |
| software-architect | `software-architect.template.md:109` | team-leader | without stopping work if absent) in the phase brief and team-leader handoff. | batch or completion phase |
| software-architect | `software-architect.template.md:158` | team-leader | step-by-step instructions — the team-leader owns decomposition. | batch or completion phase |
| software-architect | `software-architect.template.md:242` | team-leader | ## Team-leader handoff | batch or completion phase |
| software-architect | `software-architect.template.md:278` | team-leader | section. The team-leader re-derives all of it, and two orderings that disagree | batch or completion phase |
| team-leader | `team-leader.template.md:141` | researcher-expert | / BLOCKER    / Stop. Return numbered blockers with evidence to the orchestrator. For a plan-free BUGFIX, it re | research phase or `research-report.md` |
| team-leader | `team-leader.template.md:376` | visual-reviewer | proof. Confirm that rendered visual-reviewer screenshots exist for both dark | visual-review phase or `visual-review.md` |
| team-leader | `team-leader.template.md:382` | visual-reviewer | the visual-reviewer. | visual-review phase or `visual-review.md` |
| team-leader | `team-leader.template.md:422` | researcher-expert | questions or researcher-expert; do not route to software-architect or Gate 2. | research phase or `research-report.md` |
| team-leader | `team-leader.template.md:422` | software-architect | questions or researcher-expert; do not route to software-architect or Gate 2. | architecture phase or `implementation-plan.md` |
| team-leader | `team-leader.template.md:423` | software-architect | For a planned flow, the orchestrator invokes software-architect to revise | architecture phase or `implementation-plan.md` |
| team-leader | `team-leader.template.md:453` | visual-reviewer | "N/A"); visual-reviewer evidence against the approved prototype (or — for a UI | visual-review phase or `visual-review.md` |
| team-leader | `team-leader.template.md:524` | researcher-expert | or researcher-expert, never software-architect/Gate 2. A decomposition that | research phase or `research-report.md` |
| team-leader | `team-leader.template.md:524` | software-architect | or researcher-expert, never software-architect/Gate 2. A decomposition that | architecture phase or `implementation-plan.md` |
| technical-content-writer | `technical-content-writer.template.md:63` | ui-ux-designer | and reference tokens by name. When it does not, return a dependency on ui-ux-designer to | design phase or `design-spec.md` |
| technical-content-writer | `technical-content-writer.template.md:326` | ui-ux-designer | producing them is the ui-ux-designer's. | design phase or `design-spec.md` |
| technical-content-writer | `technical-content-writer.template.md:330` | ui-ux-designer | `.ptah/specs/<TASK_FOLDER>/design-assets-inventory.md`, written by the ui-ux-designer. | design phase or `design-spec.md` |
| ui-ux-designer | `ui-ux-designer.template.md:17` | frontend-developer | technical-content-writer and frontend-developer, not after them. | implement phase |
| ui-ux-designer | `ui-ux-designer.template.md:17` | technical-content-writer | technical-content-writer and frontend-developer, not after them. | docs phase or `content-specification.md` |

| backend-developer | `backend-developer.template.md:223` | software-architect (alias) | The architect decides on an unplanned abstraction. | architecture phase |
| project-manager | `project-manager.template.md:77` | software-architect (alias) | Mechanism choice is delegated to the architect. | architecture phase |
| project-manager | `project-manager.template.md:208` | software-architect (alias) | Requirements must avoid preempting architecture choice. | architecture phase |
| researcher-expert | `researcher-expert.template.md:16` | software-architect (alias) | Architect needs research before design. | research report to architecture phase |
| researcher-expert | `researcher-expert.template.md:147` | software-architect (alias) | Architect owns final design decision. | architecture phase |
| team-leader | `team-leader.template.md:17` | software-architect (alias) | Decomposition follows architecture. | architecture phase deliverable |
| team-leader | `team-leader.template.md:523` | software-architect (alias) | Planned blocker returns to architect. | architecture phase revision |
| technical-content-writer | `technical-content-writer.template.md:64` | ui-ux-designer (alias) | Missing visual direction requires design. | design phase |
| software-architect | `software-architect.template.md:116` | ui-ux-designer (alias) | Design tokens supplied by designer. | design-spec.md |

## Content with no clear home

| Content | Source | Recommendation |
| --- | --- | --- |
| `templateId`, version, model, relevance score, include flag and dependency metadata | `backend-developer.template.md:2-11`, `team-leader.template.md:2-20` | Retire with agent template registry; phase routing and executor choice own the behavior. |
| Empty shared `cli-delegation.md` and `replacement-policy.md` | `cli-delegation.md:1`, `replacement-policy.md:1` | Drop empty blocks; preserve substantive behavior wherever templates state it. |

## Duplicated content

| Repeated rule | Evidence | Consolidation |
| --- | --- | --- |
| Tool priority and skill loading | `backend-developer.template.md:34-35`, `frontend-developer.template.md:35-36`, `code-logic-reviewer.template.md:32-33` | One shared phase execution rule. |
| Clarification protocol and role-specific trigger | `backend-developer.template.md:38-39`, `team-leader.template.md:40-41`, `clarification-protocol.md:1-3` | One phase clarification rule with per-phase trigger. |
| Task-spec contract | `backend-developer.template.md:36-37`, `team-leader.template.md:37-38`, `template-partial-resolver.ts:95-99` | One serialized phase contract. |
| Reviewer stance and evidence-backed verdicts | `code-logic-reviewer.template.md:50-51`, `code-style-reviewer.template.md:60-61`, `visual-reviewer.template.md:53-54`, `reviewer-stance.md:1-5` | One review rule shared by review and visual-review phases. |
| Return and refusal sections | `backend-developer.template.md:195-230`, `frontend-developer.template.md:208-247`, `devops-engineer.template.md:142-175` | Common phase return and refusal fields, with phase-specific artifacts. |

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Count blank lines with their containing section and split lines that name another role. | Exclude blanks; assign by section; split cross-references. | `backend-developer.template.md:1-32`, `software-architect.template.md:94-122` | Yes |
| Treat frontmatter model and template IDs as retired routing metadata. | Phase discipline; project guidance; remove metadata. | `team-leader.template.md:2-20`, `task-description.md:22-29`, `task-description.md:33-37` | Yes |
| Map team-leader Mode 1 to `batch`; Mode 3 to `completion`; Mode 2 to orchestrator acceptance step. | New phase for Mode 2; acceptance step. | `team-leader.template.md:114-193`, `team-leader.template.md:274-348`, `team-leader.template.md:349-392`, `task-description.md:110-114`, `team-leader-modes.md:10-16` | Yes |
| Keep Mode 2 commit mechanics outside phase definitions; acceptance contract states required checks and review evidence. | Put git commands in batch phase; orchestrator acceptance. | `team-leader.template.md:295-348`, `team-leader-modes.md:40-45`, `task-description.md:112-113` | Yes |
| Treat documentation and content format recipes as skill knowledge where they define reusable practice. | Docs discipline; skill knowledge. | `technical-content-writer.template.md:88-311`, `technical-content-writer.template.md:47-54` | Yes |
| Treat repository-focus sections as workspace facts even where they contain general examples; retain reusable rules in corresponding phase. | Entirely phase; entirely guidance. | `backend-developer.template.md:165-180`, `visual-reviewer.template.md:193-205`, `task-description.md:22-24` | Yes |

## Clarifications Needed

None.
