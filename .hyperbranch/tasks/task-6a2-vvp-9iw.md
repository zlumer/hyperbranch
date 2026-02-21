---
id: 6a2-vvp-9iw
status: todo
parent: null
dependencies: []
---
# Add a `hb merge` command

Usage:
```
hb merge [--ff-only|--rebase|--normal|--squash] [--rm] <run_id>
```

Performs a git merge to the base branch from the run.

1. Where can we get the base branch name?
2. Default mode is --rebase.
3. If there are conflicts, return error and don't proceed.
4. `--rm` removes the run after successful merge.

Also add http api ednpoint for that as well.

