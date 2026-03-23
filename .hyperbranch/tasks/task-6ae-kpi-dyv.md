---
id: 6ae-kpi-dyv
status: plan
parent: null
dependencies: []
---
# core: add opencode setting tuning stage to the container initial process

when opencode is running and ready, and no sessions have been started yet, we need to tune the settings (not just the model)

add a function to the opencode module that will tune the settings as required

for now, limit this to the following:
- "Expand shell tool parts - Show shell tool parts expanded by default in the timeline" -- set to false

we will add more later