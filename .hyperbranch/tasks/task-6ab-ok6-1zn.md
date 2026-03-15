---
id: 6ab-ok6-1zn
status: build
parent: null
dependencies: []
---
# core: list all runs in `hb ps` and `GET /tasks/<task>/runs`

currently we only list runs that have git branches.

we need to be smart about this:
1. find all git branches (same as now)
2. find all docker containers with names that match
3. find all clones inside the `.hyperbranch` directory that exist

and compile this into a list of runs with the corresponding status -- review the run status literals and check whether we need to update them