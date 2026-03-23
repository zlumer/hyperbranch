---
id: 6ae-ign-rod
status: plan
parent: null
dependencies: []
---
# core: task pipeline

1. Plan (and ask questions until 100% sure)
2. Build (until 100% complete)
3. mark the task as done (only when 100% complete)
4. `aider --commit --no-analytics --no-gitignore`

make it extendable -- 1+2 can be any number of other steps:
- just Build
- Plan, wait for user to answer, Build
- Plan, spawn another session to answer questions, Build
- Plan, self-review with another model, Ralph Loop Build
etc.