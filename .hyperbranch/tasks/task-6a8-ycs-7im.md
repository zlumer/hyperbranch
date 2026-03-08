---
id: 6a8-ycs-7im
status: plan
parent: null
dependencies: []
---
# show the current drift in the run status bar

frontend: in the run status bar (on top of iframe) we need to show git drift: how many commits are on the upstream base branch (not merged to the run branch) and how many on the run branch (not merged to the upstream branch)
if upstream commits exist: show "pull" button that allows to choose strategy (merge/rebase) and pulls the base branch
if run commits exist: show "accept" button (unchanged)

example:
- run `hb/abcd/1` was created from master
- master has 2 new commits
- (2↓ 0↑) is shown
- if we press "pull+rebase" the command `git pull --rebase` will be launched inside the run container