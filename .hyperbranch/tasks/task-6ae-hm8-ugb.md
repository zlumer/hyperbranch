---
id: 6ae-hm8-ugb
status: done
parent: null
dependencies: []
---
# core: extract all opencode requests to a single service module

opencode service module:
1. launch an instance of the module on top of any opencode host/port
2. make sure all code only works with opencode through that module, never directly
3. expose getter functions for getting fresh data out of opencode (e.g. get sessions)
4. expose action functions that order opencode to do something (e.g. send a prompt)
5. expose the state machine of opencode status:
- idle
- working (session running on a prompt)
- blocked by user input (ask question tool is waited upon or a permission request etc.)
6. allow actions to be put in a queue to run only when opencode becomes idle; and a callback/promise `await waitForState("idle")`