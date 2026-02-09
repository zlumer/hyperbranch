---
id: 69x-aaw-oq1
status: done
parent: null
dependencies: []
---
# create/run improvements umbrella

A set of improvements for the `hb create` & `hb run` commands.

Usage scenario that is covered by this task:
1. Create a new task.
2. Run this new task.
3. Get a fully prepared branch with new commits that we can merge in one line.
4. Garbage collection (merged branch, dangling worktrees)

What is NOT covered:
- running subtasks or task chains
- ui changes

## Subtasks
- [x] commit task automatically after `hb create`
- [x] create base branch off the current branch (where `hb run` is called)
- [x] check if the task file exists in the branch, and if not, throw an error immediately
- [x] skip untracked file synchronization during `hb run`
- [x] refactor garbage collection algorithm:
  - [x] delete merged branches without `-f`
  - [x] delete dangling worktrees (no branch) without `-f`
  - [x] prevent deletion of worktrees with uncommitted changes (unless `-f`)
  - [x] kill working containers before deleting worktrees (if `-f` is provided)
- [x] run `docker logs` on the container in background and write to a new log file (e.g. `docker.log`)
- [x] create "run" files (`Dockerfile`, `run.sh`, `hb.cid`, `stderr.log`, `stdout.log`) in a subdirectory (e.g., `.hyperbranch/.current-run/`) instead of the root of the worktree (make sure that there's a single config function to get parent dir to these files and it's used everywhere in the codebase)
- [x] commit all changed files at the end of the task run
	- [x] for untracked files make an intelligent decision: add with `git add` or ignore in `.gitignore`
