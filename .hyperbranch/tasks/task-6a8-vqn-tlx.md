---
id: 6a8-vqn-tlx
status: build
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

Findings:
- Frontend (`RunListItem.tsx`) already has UI for "Resume Run" and handles `stopped`, `paused`, `failed`, `completed` states.
- Need to add `paused` and `stopped` states to the backend `RunState` type.
- Update `Lifecycle.getRunState` to return `stopped` instead of `preparing` when artifacts exist but no container.
- Update `Lifecycle.getRunState` to return `paused` when container exists but exited (instead of `completed`/`failed` if that's preferred, but frontend already handles completed/failed as resumable. I will map exited to `paused` for clarity).
- Add `resumeRun` to `cli/services/runs.ts` (calls `Lifecycle.start`).
- Add `POST /tasks/:id/runs/:runId/resume` to `cli/server/routes/tasks.ts`.