Verdict: REVISE

2. Resolved — The summary and root cause now describe per-question state repetition as an inference from server token counts. F1 retains the payload changes and proposes measuring their effect. `research-report.md:15–18,98–101,115,135–136`
5. Open — The modeled latency range was replaced with observed timings, but the root cause should say “most successful calls” because the 39–58 s range describes the HTTP 200 subset. The table also still lists 50.4 tokens/s against both single-question timings. Label it as the 11.7 s trial's rate, or list both rates (50.4 and 47.6 tokens/s). `research-report.md:19–20,72–74,82–85,101–102`
6. Resolved — F3 now makes timeout fallback conditional on the POST still being pending at 15 s and says disabling the model skips the POST. `research-report.md:117,127–128`
