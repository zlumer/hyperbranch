---
id: 69y-kbv-149
status: done
parent: null
dependencies: []
---
# Fix sweep command not removing merged worktrees

The `sweep` command is failing to remove merged branches because it incorrectly parses the output of `git branch`. Specifically, when a branch is checked out in a worktree (which is the case for active runs), `git branch` prefixes it with a `+` sign. The current implementation only accounts for the `*` prefix (current branch) or whitespace, causing valid merged branches to be unrecognized.

## Plan

1.  **Update `cli/utils/git.ts`**:
    *   Modify `isBranchMerged` to strip `+` and `*` prefixes from the `git branch --merged` output.
    *   Apply the same fix to `getNextRunBranch` and `getLatestRunBranch` to ensure consistent branch parsing.
2.  **Update `cli/commands/rm.ts`**:
    *   Modify `removeTask` to correctly parse `git branch --list` output, stripping `+` prefixes to ensure task removal works correctly for worktree branches.
3.  **Verify**:
    *   Run existing tests to ensure no regression.
