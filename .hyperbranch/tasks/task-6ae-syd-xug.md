---
id: 6ae-syd-xug
status: plan
parent: null
dependencies: []
---
# frontend/core: add a "cleanup done" button

add a "cleanup done" button to the kanban board

cleanup logic:
1. find all tasks that are "done"
2. find all runs from these tasks
3. only cleanup runs that don't have any commits on top of the base branch
4. only cleanup runs that don't have any uncommitted files
5. only cleanup runs that are "idle" or stopped -- not if they're "working"
6. cleanup the runs that match all mentioned rules (standard cleanup, delete branch+container+directory)

frontend:
- the button is only visible if cleanup is possible
- when the button is pressed, call backend and make the button inactive