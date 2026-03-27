---
id: 6ag-doz-j76
status: build
parent: null
dependencies: []
---
# core: fix failing health checks

in one of the recent commits the container/opencode lifecycle was broken:

`[OpencodeService] health check failed with status: NaN`

```
[OpencodeService] health check fetch failed: fetch failed
Failed to create session with prompt. id: hb/6af-kie-dtx/2, state: offline TypeError: fetch failed
```

detect the issue, write a red test for this using our e2e testing capabilities, check that the test fails, fix the issue, check that the test becomes green

don't test the implementation, test the behavior:
- launch a run in an e2e test
- check the full lifecycle of the run that it finishes successfully
- merge the run in an e2e test
- check that everything worked


if you're not able to use Docker in the e2e testing, you can abstract away sandboxing to a sandbox provider and implement container sandboxing with another tech that works in your environment