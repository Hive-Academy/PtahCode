{
  "targets": [
    {
      "target_name": "windows_job",
      "conditions": [
        ["OS=='win'", { "sources": ["native/windows_job.c"] }, { "type": "none" }]
      ]
    }
  ]
}
