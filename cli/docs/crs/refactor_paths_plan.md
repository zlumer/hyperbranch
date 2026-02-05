# Plan: Centralize Paths and Fix Recursive Worktree Issue

## 1. Create `cli/utils/paths.ts`
Create a new utility file to serve as the single source of truth for Hyperbranch directory structure.

```typescript
import { join } from "@std/path";

export const HYPERBRANCH_DIR = ".hyperbranch";
export const WORKTREES_DIR_NAME = ".worktrees";
export const TASKS_DIR_NAME = "tasks";

// Absolute paths for file system operations
export const WORKTREES_DIR = join(Deno.cwd(), HYPERBRANCH_DIR, WORKTREES_DIR_NAME);
export const TASKS_DIR = join(Deno.cwd(), HYPERBRANCH_DIR, TASKS_DIR_NAME);

// Git paths (forward slash, relative) for filtering ls-files
export const GIT_WORKTREES_PATH = `${HYPERBRANCH_DIR}/${WORKTREES_DIR_NAME}`;
export const GIT_LEGACY_WORKTREES_PATH = `${HYPERBRANCH_DIR}/worktrees`;
```

## 2. Refactor `cli/utils/tasks.ts`
Update this file to use the new constant instead of defining its own.

*   Remove local `TASKS_DIR` definition.
*   Import `TASKS_DIR` from `./paths.ts`.
*   Export it for backward compatibility.

## 3. Update `cli/hb.ts`
Update the main entry point to import `TASKS_DIR` from the new `cli/utils/paths.ts` instead of `cli/utils/tasks.ts` (optional, but cleaner) or rely on the re-export.

## 4. Update Commands
Update all commands that access the worktree directory to use the `WORKTREES_DIR` constant.

*   **`cli/commands/run.ts`**: Replace `.hyperbranch/worktrees` with `WORKTREES_DIR`.
*   **`cli/commands/logs.ts`**: Replace `.hyperbranch/worktrees` with `WORKTREES_DIR`.
*   **`cli/commands/stop.ts`**: Replace `.hyperbranch/worktrees` with `WORKTREES_DIR`.
*   **`cli/commands/ps.ts`**: Replace `.hyperbranch/worktrees` with `WORKTREES_DIR`.

## 5. Update `cli/utils/git.ts`
Modify the file copying logic to prevent recursive copying of the worktree directory into itself.

*   Import `GIT_WORKTREES_PATH` and `GIT_LEGACY_WORKTREES_PATH` from `./paths.ts`.
*   In `copyUntrackedFiles(dest: string)`, iterate through the files list.
*   Add a check: if a file path starts with `GIT_WORKTREES_PATH` or `GIT_LEGACY_WORKTREES_PATH`, `continue` (skip) the loop for that file.
