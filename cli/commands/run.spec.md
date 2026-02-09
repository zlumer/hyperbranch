# Run Command Specification (`cli/commands/run.ts`)

## Overview

The `run` command executes a Hyperbranch task within an isolated, reproducible environment. It orchestrates Git worktrees to preserve the user's exact state, manages the execution environment (Docker), and handles logging and cleanup.

**Key Change:** As of the latest version, `hb run` executes in **Detached Mode**. The CLI command initiates the container and exits immediately, leaving the task running in the background. This enables parallel execution of multiple tasks.

## Goals

1.  **Isolation**: Runs do not interfere with the user's current working directory.
2.  **State Preservation**: The agent runs against a fresh worktree based on the committed state of the base branch. Uncommitted modifications to tracked files in the original workspace are **ignored**.
3.  **Safety**: The command aborts if worktree creation fails or if the task file is missing in the base branch.
4.  **Parallelism**: Support running multiple tasks simultaneously without console interleaving.
5.  **Observability**: Logs are persisted to files and viewed via `hb logs`.
6.  **Control**: Tasks can be listed (`hb ps`) and terminated (`hb stop`).
7.  **Auto-Commit**: Upon successful completion, the agent's work is automatically committed to the run branch.

## Architecture

The implementation uses a modular structure:

*   **`cli/commands/run.ts`**: The orchestrator (Fire-and-forget).
*   **`cli/commands/logs.ts`**: Log viewer (`tail -f`).
*   **`cli/commands/stop.ts`**: Task terminator.
*   **`cli/commands/ps.ts`**: Status monitor.
*   **`cli/utils/docker.ts`**: Docker execution (supports detached `nohup` execution).
*   **`cli/utils/paths.ts`**: Centralized path management (e.g., `getRunDir`).

## Commands

### `hb run <task-id>`
*   Prepares worktree and assets in `.hyperbranch/.current-run/`.
*   Launches Docker container in background.
*   Prints Task ID and Container ID (CID) then exits.

### `hb logs <task-id> <run-index>`
*   Finds the worktree for the specified task and run index.
*   Streams `.hyperbranch/.current-run/docker.log` using `tail -f`.

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
    [env]
    vars = ["OPENAI_API_KEY", "GITHUB_TOKEN"] # Env vars to forward
    ```

### 2. Argument Parsing

*   `task-id` (Required).
*   `--image`, `--dockerfile` (Container customization).
*   `--exec`, `--exec-file`, `--docker-args`.

### 3. Git Worktree Preparation (`cli/utils/git.ts`)

1.  **Resolve Base Branch**:
    *   Get Task Parent ID.
    *   Exists? -> `task/<parent-id>`.
    *   Null? -> Current Branch -> `main` -> `master`.
2.  **Validate Task**:
    *   Check if `task-<id>.md` exists in the base branch. Fail if missing.
3.  **Resolve Run Branch**:
    *   Pattern: `task/<id>/<run-idx>`.
    *   Scan existing branches to find the next sequential index (e.g., `.../run-1`, `.../run-2`).
4.  **Create Worktree**:
    *   Command: `git worktree add -b <run-branch> <worktree-path> <base-branch>`.
    *   Path: `.hyperbranch/.worktrees/<run-branch-flattened>`.
5.  **Setup Artifacts**:
    *   Directory: `.hyperbranch/.current-run/`.
    *   Add `.hyperbranch/.current-run/` to `.gitignore` in the worktree.

### 4. Environment Preparation (`cli/utils/system.ts`)

1.  **Caches**: Detect usage (lockfiles) and mount:
    *   `npm`: `npm config get cache`.
    *   `yarn`: `yarn cache dir`.
    *   `pnpm`: `pnpm store path`.
2.  **Agent Config**: Mount host `~/.opencode` (or equivalent) as **Read-Only**.
3.  **Env Vars**: Collect values for keys listed in `config.env_vars`.
4.  **User Mapping**: UID/GID mapping to prevent permission issues.

### 5. Execution & Logging (`cli/utils/docker.ts`, `run.sh`)

1.  **Assets**: Copy `run.sh` and `Dockerfile` to `.hyperbranch/.current-run/`.
2.  **Detached Execution**:
    *   Executes `run.sh` in the background using `nohup`.
    *   Deno process waits *only* for confirmation of container start (`hb.cid` file), then exits.
3.  **Log Setup**:
    *   `run.sh` spawns `docker logs -f <cid> > .hyperbranch/.current-run/docker.log &`.
    *   `nohup` redirects script output to `stdout.log` / `stderr.log` (mostly debug info).
4.  **Auto-Commit**:
    *   `run.sh` waits for container exit.
    *   If exit code 0: `git add .` && `git commit -m "feat: complete task <id>"`.

### 6. Cleanup (`hb rm`)

*   `hb rm --sweep` cleans up merged branches and dangling worktrees.
*   Safe by default: checks for unmerged commits and dirty status.
*   Force (`-f`) overrides safety checks.

## Error Handling & Logging Strategy

*   **Startup Failures**: Errors during preparation (Git, Config) are printed to Console.
*   **Runtime Failures**: Once detached, all output goes to log files in `.hyperbranch/.current-run/`.
*   **Debug**: Use `hb logs` to investigate runtime issues.
