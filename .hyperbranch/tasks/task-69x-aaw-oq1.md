---
id: 69x-aaw-oq1
status: todo
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
- [ ] commit task automatically after `hb create`
- [ ] skip untracked file synchronization during `hb run`
- [ ] refactor garbage collection algorithm:
  - [ ] delete merged branches without `-f`
  - [ ] delete dangling worktrees (no branch) without `-f`
  - [ ] prevent deletion of worktrees with uncommitted changes (unless `-f`)
  - [ ] kill working containers before deleting worktrees (if `-f` is provided)
- [ ] output stdout&stderr into a single file in addition to separate stdout/stderr files (as implemented now)
- [ ] create "run" files (`Dockerfile`, `run.sh`, `hb.cid`, `stderr.log`, `stdout.log`) in a subdirectory (e.g., `.hyperbranch/.current-run/`) instead of the root of the worktree (make sure that there's a single config function to get parent dir to these files and it's used everywhere in the codebase)
- [ ] commit all changed files at the end of the task run
	- [ ] for untracked files make an intelligent decision: add with `git add` or ignore in `.gitignore`
