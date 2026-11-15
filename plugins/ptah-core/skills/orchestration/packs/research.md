# Pack: research

## Discipline
Research work answers a bounded question with cited evidence. The output is a report, not a code change. The work has no build step and no code review.

## Skeleton mapping
- clarify: the pre-flight questions that fix the question and its scope. No phase file.
- plan: the optional `plan` phase. Skip it when the question is narrow.
- do: the `research` phase.
- check: the evidence check inside the `research` phase. No separate phase.
- deliver: the `completion` phase.

## Phase flow
- plan (optional): split a broad question into sub-questions before the research.
- research: collect evidence, compare options, write the report.
- completion: confirm the report answers the question. If implementation is needed, use `research-report.md` as input to the FEATURE flow: start its `plan` phase and reference the report in `task-description.md`. Otherwise, close the research task.
