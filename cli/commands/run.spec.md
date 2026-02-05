# Run Command Specification (`cli/commands/run.ts`)

## Overview

The `run` command executes a Hyperbranch task within an isolated, reproducible environment. It orchestrates Git worktrees to preserve the user's exact state (including untracked and ignored files), manages the execution environment (Docker), and handles logging and cleanup.

## Goals

1.  **Isolation**: Runs do not interfere with the user's current working directory.
2.  **State Preservation**: The agent sees the code *exactly* as the user sees it, including new files and secrets (if configured).
3.  **Safety**: The command aborts immediately on conflicts to prevent running on a broken state.
4.  **Observability**: Full separation of `stdout` and `stderr` logs, persisted within the worktree.
5.  **Performance**: Intelligent caching for package managers (npm, yarn, pnpm).

## Architecture

The implementation uses a modular structure:

*   **`cli/commands/run.ts`**: The orchestrator.
*   **`cli/utils/config.ts`**: Configuration loading (TOML).
*   **`cli/utils/git.ts`**: Git operations (Status, Stash, Worktree, Branching).
*   **`cli/utils/system.ts`**: System info (User, Caches, Signal handling).
*   **`cli/utils/docker.ts`**: Docker execution and management.

## Detailed Flow

### 1. Configuration (`cli/utils/config.ts`)

Load configuration to determine ignored files to copy and env vars to forward.

*   **Priority**: `.hyperbranch.config.toml` > `.hyperbranch/config.toml`.
*   **Format**: TOML.
*   **Schema**:
    ```toml
    [copy]
    include = ["**/.env*"]        # Glob patterns for ignored files to copy
    exclude = ["**/.env.local"]   # Glob patterns to exclude from 'include'
    includeDirs = ["node_modules"] # Directories to copy recursively (from host root)
    excludeDirs = ["node_modules/.cache"] # Glob patterns to exclude during directory copy

    env_vars = ["OPENAI_API_KEY", "GITHUB_TOKEN"] # Env vars to forward
    ```

### 2. Argument Parsing

*   `task-id` (Required).
*   `--image`, `--dockerfile` (Container customization).
*   `--exec`, `--exec-file`, `--docker-args`, `--docker-run-file`.

### 3. Git Worktree Preparation (`cli/utils/git.ts`)

1.  **Check Status**: Check for uncommitted changes.
2.  **Stash (Tracked)**: `git stash create` to capture modified tracked files (safe, no working dir change). Store hash.
3.  **Resolve Base Branch**:
    *   Get Task Parent ID.
    *   Exists? -> `task/<parent-id>`.
    *   Null? -> Default branch (`main` or `master`).
4.  **Resolve Run Branch**:
    *   Pattern: `task/<id>/<run-idx>`.
    *   Scan existing branches to find the next sequential index (e.g., `.../run-1`, `.../run-2`).
5.  **Create Worktree**:
    *   Command: `git worktree add -b <run-branch> <worktree-path> <base-branch>`.
    *   Path: `.hyperbranch/worktrees/<run-branch>`.
6.  **Apply Stash**:
    *   Run `git stash apply <hash>` inside worktree.
    *   **CRITICAL**: If conflict -> **ABORT**.

### 4. File Synchronization

Ensure the worktree matches the host state fully.

1.  **Untracked Files**:
    *   `git ls-files --others --exclude-standard`.
    *   Copy identified files to worktree.
2.  **Ignored Files**:
    *   Process `config.copy.include` patterns using host root context.
    *   Filter matches against `config.copy.exclude`.
    *   Copy matching files to worktree, preserving directory structure.
3.  **Ignored Directories**:
    *   Iterate `config.copy.includeDirs`.
    *   Recursively copy contents to worktree.
    *   Skip files/subdirectories matching `config.copy.excludeDirs`.

### 5. Environment Preparation (`cli/utils/system.ts`)

1.  **Caches**: Detect usage (lockfiles) and mount:
    *   `npm`: `npm config get cache`.
    *   `yarn`: `yarn cache dir`.
    *   `pnpm`: `pnpm store path`.
2.  **Agent Config**: Mount host `~/.opencode` (or equivalent) as **Read-Only**.
3.  **Env Vars**: Collect values for keys listed in `config.env_vars`.
4.  **User Mapping**: UID/GID mapping to prevent permission issues.

### 6. Execution & Logging (`cli/utils/docker.ts`)

1.  **Log Setup**:
    *   Create `stdout.log` and `stderr.log` in the worktree directory.
2.  **Signal Handling**:
    *   Trap `SIGINT` (Ctrl+C).
    *   On signal: Stop the specific Docker container, then exit.
3.  **Run Container**:
    *   Stream output to Console (Live).
    *   Pipe `stdout` -> `stdout.log`.
    *   Pipe `stderr` -> `stderr.log`.

### 7. Cleanup

*   Remove container (`--rm` handled by Docker, or manual removal on stop).
*   Worktree remains for inspection.

## Error Handling & Logging Strategy

*   **Early Failures**: If the worktree cannot be created (e.g., git error), logs are output **only to the console**.
*   **Runtime Failures**: Once the worktree exists, all logs are captured in `stdout.log` and `stderr.log`.
*   **Exception Handling**: Utility functions **throw Errors** rather than exiting the process. The main command handler catches these errors, ensures cleanup (stopping containers), and logs the failure.

## Testing Strategy

*   **Unit Tests**: Core logic (Git, Docker command generation, Config parsing) is tested using **Unit Tests**.
*   **Mocking**: `Deno.Command` is mocked to verify command construction and execution flows without spawning actual processes or requiring a Docker daemon during tests.
*   **Libraries**: Use `@std/testing` and `@std/assert`.

## Modules

### `cli/utils/config.ts`

```typescript
export interface CopyConfig {
    include: string[];
    exclude: string[];
    includeDirs: string[];
    excludeDirs: string[];
}
export interface RunConfig {
    copy: CopyConfig;
    env_vars: string[];
}
export function loadConfig(): Promise<RunConfig>;
```

### `cli/utils/git.ts`

```typescript
export function isGitDirty(): Promise<boolean>;
export function createStash(): Promise<string | null>; // Returns hash
export function resolveBaseBranch(taskId: string): Promise<string>;
export function getNextRunBranch(taskId: string): Promise<string>;
export function createWorktree(branch: string, base: string, path: string): Promise<void>;
export function applyStash(path: string, hash: string): Promise<void>; // Throws on conflict
export function copyUntrackedFiles(dest: string): Promise<void>;
export function copyIgnoredFiles(dest: string, config: CopyConfig): Promise<void>;
```

### `cli/utils/system.ts`

```typescript
export function getPackageCacheMounts(): Promise<string[]>; // Returns Docker mount args
export function getAgentConfigMount(): Promise<string>;
export function getEnvVars(keys: string[]): Record<string, string>;
export function setupSignalHandler(containerId: string): void;
```
