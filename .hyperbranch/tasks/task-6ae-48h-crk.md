---
id: 6ae-48h-crk
status: plan
parent: null
dependencies: []
---
# frontend: model selector

we need to give the user an option to choose model when starting a run.
1. core: get the list of available models (how?)
2. server: add an endpoint to get all models
3. frontend: display model select when creating a run
4. frontend: pass model name to server when creating a run
5. server: get an optional model name from frontend
6. core: pass the model name to opencode -- strictly before the first prompt, so that the prompt does not start with another model