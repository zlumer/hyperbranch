# Run Command Specification (`cli/commands/run.ts`)

## Overview

The `run` command executes a Hyperbranch task within an isolated, reproducible environment. It orchestrates Git worktrees to preserve the user's exact state (including untracked and ignored files), manages the execution environment (Docker), and handles logging and cleanup.

**Key Change:** As of the latest version, `hb run` executes in **Detached Mode**. The CLI command initiates the container and exits immediately, leaving the task running in the background. This enables parallel execution of multiple tasks.

## Goals

1.  **Isolation**: Runs do not interfere with the user's current working directory.
2.  **State Preservation**: The agent runs against a fresh worktree based on the committed state of the base branch. Untracked files and ignored files (if configured) are synchronized, but uncommitted modifications to tracked files are **ignored** to avoid conflicts.
3.  **Safety**: The command aborts if worktree creation fails.
4.  **Parallelism**: Support running multiple tasks simultaneously without console interleaving.
5.  **Observability**: Logs are persisted to files and viewed via `hb logs`.
6.  **Control**: Tasks can be listed (`hb ps`) and terminated (`hb stop`).

## Architecture

The implementation uses a modular structure:

*   **`cli/commands/run.ts`**: The orchestrator (Fire-and-forget).
*   **`cli/commands/logs.ts`**: Log viewer (`tail -f`).
*   **`cli/commands/stop.ts`**: Task terminator.
*   **`cli/commands/ps.ts`**: Status monitor.
*   **`cli/utils/docker.ts`**: Docker execution (supports detached `nohup` execution).

## Commands

### `hb run <task-id>`
*   Prepares worktree and assets.
*   Launches Docker container in background.
*   Prints Task ID and Container ID (CID) then exits.

### `hb logs <task-id> <run-index>`
*   Finds the worktree for the specified task and run index.
*   Streams `stdout.log` using `tail -f`.

### `hb stop <task-id>`
*   Finds the running container for the task.
*   Executes `docker stop`.

### `hb ps`
*   Lists all active worktrees/tasks.
*   Shows status (Running/Stopped), CID, and Age.

## Detailed Flow (`hb run`)

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

1.  **Resolve Base Branch**:
    *   Get Task Parent ID.
    *   Exists? -> `task/<parent-id>`.
    *   Null? -> Default branch (`main` or `master`).
2.  **Resolve Run Branch**:
    *   Pattern: `task/<id>/<run-idx>`.
    *   Scan existing branches to find the next sequential index (e.g., `.../run-1`, `.../run-2`).
3.  **Create Worktree**:
    *   Command: `git worktree add -b <run-branch> <worktree-path> <base-branch>`.
    *   Path: `.hyperbranch/worktrees/<run-branch>`.

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

1.  **Detached Execution**:
    *   Executes `run.sh` in the background using `nohup`.
    *   Deno process waits *only* for confirmation of container start (CID file), then exits.
2.  **Log Setup**:
    *   Shell redirection pipes `stdout` -> `stdout.log` and `stderr` -> `stderr.log` within the worktree.
    *   No logs are streamed to the CLI console (use `hb logs`).

### 7. Cleanup

*   Remove container (`--rm` handled by Docker, or manual removal on stop).
*   Worktree remains for inspection.

## Error Handling & Logging Strategy

*   **Startup Failures**: Errors during preparation (Git, Config) are printed to Console.
*   **Runtime Failures**: Once detached, all output goes to `stdout.log` and `stderr.log` in the worktree.
*   **Debug**: Use `hb logs` to investigate runtime issues.

## Modules

### `cli/utils/git.ts`
Updated to support run discovery.

```typescript
export function getLatestRunBranch(taskId: string): Promise<string | null>;
```

### `cli/utils/docker.ts`
Updated to support detached execution.

```typescript
export function runContainer(
  config: DockerConfig, 
  logDir: string, 
  onStart: (id: string) => void
): Promise<void>; 
// Returns after container ID is detected, does not wait for exit.
```
