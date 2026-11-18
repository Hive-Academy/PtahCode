# Thoth design target

This folder is the tracked design target for the Memory and Skills panels of the Thoth hub in
the Electron app (`/thoth/memory`, `/thoth/skills`). It belongs to task `TASK_2026_2271_7a3e`.
The panels follow the Settings rev 2 "Flight deck" direction and the control rules of
[../settings/README.md](../settings/README.md#user-decisions-after-rev-2).

**State: approved by the user on 2026-11-18.** Phase 2 (Memory) and phase 3 (Skills) apply it.

## User decisions

These decisions come from the user (2026-11-18). They take priority over the design spec, the
apply plan and the screens.

1. Memory has no long scroll list as its main view. The main view is a memory graph with
   advanced options. A List view and an inspector stay for detail and accessibility.
2. Graph edges are semantic and shared. A new RPC, `memory:graph`, returns nearest-neighbor
   similarity edges from the sqlite-vec embeddings (`memory_chunks_vec`), plus same-subject and
   same-session edges. When sqlite-vec is off, the graph shows only the subject and session
   edges and says so.
3. The graph renderer is a canvas/WebGL library (Sigma.js + graphology), loaded lazily.
4. Every dropdown is the shared `ptah-select` (designed menu). Every text field is `ptah-field`
   with a true floating label. The exceptions of the Settings rules apply (setting rows, compact
   table cells, compact toolbar search).
5. Delivery: phase 1 is this design (docs only). Phase 2 is Memory with the `memory:graph`
   RPC, in one pull request. Phase 3 is Skills, in one pull request.

## Files

| File                             | Content                                                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `prototype/thoth-prototype.html` | Prototype, self-contained. Open it in a browser. Controls: theme, width (784, 1168, 1440), panel, data state                                     |
| `thoth-design-spec.md`           | Design spec: information architecture, graph, component mapping, new components, states, motion, accessibility, responsive rules, feature parity |
| `thoth-apply-plan.md`            | Apply plan for phase 2 and phase 3, with the `memory:graph` contract                                                                             |
| `prototype/screens/`             | Screens of the prototype (see the index below)                                                                                                   |

The prototype draws the graph with a small canvas force layout of its own. It shows the design
only. The product uses Sigma.js, as the apply plan says.

## Screen index

The screens are captures of the prototype in headless Chromium at device scale 1. The URL
parameters of each screen are in section 0 of the design spec. The name has this pattern:
`<panel>-<view>[-<state>]-<theme>-<width>.jpg`.

| Screen                                 | Content                                | Theme | Width |
| -------------------------------------- | -------------------------------------- | ----- | ----: |
| `memory-graph-dark-784.jpg`            | Memory, Graph                          | dark  |   784 |
| `memory-graph-dark-1168.jpg`           | Memory, Graph                          | dark  |  1168 |
| `memory-graph-dark-1440.jpg`           | Memory, Graph                          | dark  |  1440 |
| `memory-graph-light-784.jpg`           | Memory, Graph                          | light |   784 |
| `memory-graph-light-1168.jpg`          | Memory, Graph                          | light |  1168 |
| `memory-graph-light-1440.jpg`          | Memory, Graph                          | light |  1440 |
| `memory-graph-inspector-dark-1168.jpg` | Graph with one node selected           | dark  |  1168 |
| `memory-graph-inspector-light-784.jpg` | Graph with one node selected           | light |   784 |
| `memory-graph-clusters-dark-1440.jpg`  | Graph, Clusters mode                   | dark  |  1440 |
| `memory-graph-vecoff-dark-1168.jpg`    | Graph, vectors off (no semantic edges) | dark  |  1168 |
| `memory-graph-capped-light-1168.jpg`   | Graph, node cap reached                | light |  1168 |
| `memory-graph-empty-dark-1168.jpg`     | Graph, no memories                     | dark  |  1168 |
| `memory-list-light-1168.jpg`           | Memory, List                           | light |  1168 |
| `memory-timeline-dark-1168.jpg`        | Memory, Timeline                       | dark  |  1168 |
| `memory-boards-dark-1168.jpg`          | Memory, Boards                         | dark  |  1168 |
| `memory-code-light-1168.jpg`           | Memory, Code index                     | light |  1168 |
| `memory-health-dark-1168.jpg`          | Memory, Health                         | dark  |  1168 |
| `memory-health-vecoff-light-1168.jpg`  | Memory, Health, vectors off            | light |  1168 |
| `skills-library-dark-784.jpg`          | Skills, library                        | dark  |   784 |
| `skills-library-dark-1168.jpg`         | Skills, library                        | dark  |  1168 |
| `skills-library-dark-1440.jpg`         | Skills, library                        | dark  |  1440 |
| `skills-library-light-784.jpg`         | Skills, library                        | light |   784 |
| `skills-library-light-1168.jpg`        | Skills, library                        | light |  1168 |
| `skills-library-light-1440.jpg`        | Skills, library                        | light |  1440 |
| `skills-agents-dark-1168.jpg`          | Skills, Agents tab                     | dark  |  1168 |
| `skills-detail-dark-1168.jpg`          | Skills, agent detail drawer            | dark  |  1168 |
| `skills-maintenance-light-1168.jpg`    | Skills, Maintenance tab                | light |  1168 |

## Open questions

The design is approved. These points stay open for phase 2. They are in section 13 of the
design spec.

1. The node cap (150 at first open, 1,500 maximum) needs a measurement on a large database.
2. The similarity threshold (0.75) and the neighbor count (8) need tuning on real distances.
3. Suggested boards keep their current source in phase 2. Graph clusters are a later option.
