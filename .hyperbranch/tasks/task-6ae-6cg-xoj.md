---
id: 6ae-6cg-xoj
status: done
parent: null
dependencies: []
---
# frontend/server/core: "reverse-merge base branch"

on the run screen in header add a button to reverse-merge the run on top of the base branch
1. frontend: button is shown if there are any new commits in the base branch (use same code to check that drift calculation uses)
2. server: endpoint, cli: command
3. core: ensure that base branch has commits that are not in the target run branch
4. core: push the base branch commits to the git remote corresponding to the run branch
5. core: fetch commits inside the container and merge them to the run branch using `-ff`
6. core: stash changes if needed and pop them back (keep in mind that other changes may be stashed and should not be messed with)
7. if `-ff` is not enough, mark the run as un-fast-forwardable and let the user decide whether they want to do a "smart merge"
8. "smart merge" will first try to merge inside the container without `-ff` and then call the opencode in the container using sdk and create a session to resolve merge conflicts

for now we ignore the other running sessions in the same container, we expect the user to wait for them to finish before merging