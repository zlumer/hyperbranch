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

## Execution Plan

### 1. `hb merge` CLI Command
* **Syntax:** `hb merge [--ff-only|--rebase|--merge] [--rm] <run_id>`
* **Flags:**
  * `--rebase` (Default): Rebases the run branch onto the base branch, then fast-forward merges into the base branch.
  * `--merge`: Performs a standard merge (`--no-ff`) into the base branch.
  * `--ff-only`: Performs a fast-forward only merge into the base branch.
  * `--rm`: Deletes the run and its worktree after a successful merge (calls `destroyRun`).
* **Note:** Dropped `--squash` and replaced `--normal` with `--merge`.

### 2. HTTP API Update
* Update `POST /:id/runs/:runId/merge` to accept strategies `"ff-only" | "rebase" | "merge"`.
* Return `400 Bad Request` if the merge fails (e.g., due to conflicts).

### 3. Merge Logic & Git Operations
The merge involves two distinct working directories: the **base branch** (current directory) and the **run branch** (the task's dedicated worktree).

**Dirty Working Tree Checks:**
* **Run Worktree:** If the run's worktree (`hb/task/1`) is dirty, abort immediately. The user must commit changes there before merging.
* **Base Branch:** If the base branch (current directory) is dirty, we use `git stash` before making changes to it, and `git stash pop` afterwards. If `stash pop` conflicts, the user handles it manually.

**`--rebase` Process (Default):**
1. Run `git rebase <base_branch>` **inside the run's worktree**.
2. *Conflict Handling:* If rebase fails due to conflicts, run `git rebase --abort` immediately to return to a clean state, then throw an error.
3. Run `git stash` in the base branch (if dirty).
4. Run `git merge --ff-only <run_branch>` in the base branch.
5. Run `git stash pop` in the base branch.

**`--merge` / `--ff-only` Process:**
1. Run `git stash` in the base branch.
2. Run `git merge <strategy> <run_branch>` in the base branch.
3. Run `git stash pop` in the base branch.

**Post-Merge Sync:**
* After a successful merge to the base branch (and any stashing ops), automatically run `git pull` in the base branch directory to integrate the latest remote changes.

