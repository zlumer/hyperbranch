---
id: 6a2-y47-fdf
status: completed
parent: null
dependencies: []
---
# migrate from git worktree to git clone

git worktrees seemed like a good fit but have problems inside containers:
- need to mount parent .git dir
- if we mount with write permissions -- not enough isolation, the agent might irreversibly destroy it
- if we mount without write permissions -- impossible to commit

It's time to cave in and use git clones instead of worktrees.
1. create a run branch in the main repo: `git branch <run-branch> <base-branch>`
2. create a directory manually inside `.hyperbranch/.runs/` (renamed from `.worktrees/`)
3. `git clone -b <run-branch> --single-branch --depth 1 . <clone-dir-path>` (using relative path `.`)
4. add a remote of this run repo to the main repo (named `hb-<task>-<run>`) pointing to the clone directory

a "worktree alternative" is complete. proceed with the `hb run` setup normally: copy files, set envs etc.

we can always fetch from the run repo to the main repo whenever: `git fetch hb-<task>-<run>`

changes in other places:
- rename `cli/utils/git-worktree.ts` to `cli/utils/git-clones.ts` (ignore legacy worktrees)
- when removing the run, first remove the directory. if successful, remove the remote from the main repo
- when checking if the run branch is merged, now have to fetch from the remote first: `git fetch hb-<task>-<run> <run-branch>:<run-branch>`
- update paths.ts, testing suites, and all existing references from `worktree` to `clone` and `.worktrees` to `.runs`
