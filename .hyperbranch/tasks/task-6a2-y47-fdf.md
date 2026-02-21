---
id: 6a2-y47-fdf
status: todo
parent: null
dependencies: []
---
# migrate from git worktree to git clone

git worktrees seemed like a good fit but have problems inside containers:
- need to mount parent .git dir
- if we mount with write permissions -- not enough isolation, the agent might irreversibly destroy it
- if we mount without write permissions -- impossible to commit

It's time to cave in and use git clones instead of worktrees.
1. create a run branch in the main repo
2. create a directory manually inside `.hyperbranch/.worktrees/`
3. `git clone -b <run-branch> --single-branch --depth 1 <main-repo-path>`
4. add a remote of this run repo to the main repo (named `hb-<task>-<run>`)

a "worktree alternative" is complete. proceed with the `hb run` setup normally: copy files, set envs etc.

we can always pull from the run repo to the main repo whenever

changes in other places:
- when removing the run, also remove the remote from the main repo
- when checking if the run branch is merged, now have to pull from the remote first
- maybe some run state detection will become easier but not sure

