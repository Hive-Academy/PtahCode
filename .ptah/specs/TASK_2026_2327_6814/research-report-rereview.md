Verdict: REVISE

1. Resolved — The custom endpoint omits keep-alive and daemon cold-load behavior, and the report distinguishes the 1 s conditional probe from the 4 ms measurement. `research-report.md:25–30,41–42`
2. Open — F1 now compacts the payload and caps modeled questions, but the summary and root cause still state that every server prompt includes the full state. The report identifies this as an inference from aggregate token counts. Qualify the claim where it appears. `research-report.md:15–17,96–98,111,131–132`
3. Resolved — F2 uses the estimate for admission and separately caps the POST after reserving time for fallback. `research-report.md:112`
4. Resolved — The 26 HTTP calls and 232 task rows have distinct populations, and the HTTP 500 timing is presented as consistent with the abort hypothesis. `research-report.md:78–88`
5. Open — The effective throughput calculation is corrected, but 500–999 tokens per question still does not imply 40–60 s per call. Four questions at the working rate span about 42–83 s. Attribute the typical duration to the observed calls, and identify 50.4 tokens/s as the rate for the 11.7 s trial. `research-report.md:13–19,63–72,80–82,96–98`
6. Open — The actor, measurement-time setting, later change, and disabled path are clear. F3 still says the POST stops after 15 s and falls back unconditionally. State that it aborts at 15 s if still pending, with fallback on timeout. `research-report.md:3–4,21–26,113,123–124`
7. Resolved — The revised table identifies the source and denominator for the memory percentage and explains the rounded RAM figure. `research-report.md:54–55`
