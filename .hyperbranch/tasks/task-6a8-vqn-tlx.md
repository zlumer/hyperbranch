---
id: 6a8-vqn-tlx
status: plan
parent: null
dependencies: []
---
# restore stopped/terminated container for an active run

if the container was stopped/terminated and the run is still active (worktree exists), we need to be able to restore it.
1. detect the status of the container:
- running (port active)
- paused (docker container with an appropriate name exists)
- stopped (docker container with an appropriate name does not exist)
2. allow the user to resume the run by launching the container (either resume or launch new)
3. show the status in frontend