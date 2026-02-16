# Run Command Specification (`cli/commands/run.ts`)

## Overview

The `run` command executes a Hyperbranch task within an isolated, reproducible environment. It orchestrates Git worktrees to preserve the user's exact state, manages the execution environment (Docker Compose), and handles logging and cleanup.

**Key Change:** As of the latest version, `hb run` executes in **Detached Mode**. The CLI command initiates the container using Docker Compose and exits immediately, leaving the task running in the background. This enables parallel execution of multiple tasks.

## Goals

1.  **Isolation**: Runs do not interfere with the user's current working directory.
2.  **State Preservation**: The agent runs against a fresh worktree based on the committed state of the base branch. Uncommitted modifications to tracked files in the original workspace are **ignored**.
3.  **Safety**: The command aborts if worktree creation fails or if the task file is missing in the base branch.
4.  **Parallelism**: Support running multiple tasks simultaneously without console interleaving.
5.  **Observability**: Logs are streamed directly from Docker Compose via `hb logs`.
6.  **Control**: Tasks can be listed (`hb ps` - TODO) and terminated (`hb stop`).
7.  **Auto-Commit**: Upon successful completion, the agent's work is automatically committed to the run branch (managed by the agent/entrypoint).

## Architecture

The implementation uses a modular structure:

*   **`cli/runtime/`**: Core runtime logic (Context, Lifecycle).
*   **`cli/commands/run.ts`**: The orchestrator (Fire-and-forget).
*   **`cli/commands/logs.ts`**: Log viewer (wrapper around `docker compose logs`).
*   **`cli/commands/stop.ts`**: Task terminator.
*   **`cli/commands/rm.ts`**: Deep cleanup utility.
*   **`cli/utils/docker-compose.ts`**: Docker Compose execution wrapper.
*   **`cli/utils/paths.ts`**: Centralized path management.

## Commands

### `hb run <task-id>`
*   Prepares worktree and assets in `.hyperbranch/.current-run/`.
*   Launches Docker Compose project in background.
*   Prints Run ID and Access URL then exits.

### `hb logs <task-id> [run-index]`
*   Finds the run context for the specified task and run index (defaults to latest).
*   Streams logs using `docker compose logs -f`.

### `hb stop <task-id> [run-index]`
*   Finds the run context.
*   Executes `docker compose stop`.

### `hb rm <task-id>/<run-index>`
*   Performs a deep cleanup:
    1.  Stops container and removes volumes (`docker compose down -v`).
    2.  Removes the Git worktree (`git worktree remove --force`).
    3.  Deletes the run branch (`git branch -D`).

## Detailed Flow (`hb run`)

### 1. Configuration (`cli/utils/config.ts`)

Load configuration to determine ignored files to copy and env vars to forward.

*   **Priority**: `.hyperbranch.config.toml` > `.hyperbranch/config.toml`.

### 2. Argument Parsing

*   `task-id` (Required).
*   `--image`, `--dockerfile` (Container customization).
*   `--exec`, `--exec-file` (Override entrypoint).

### 3. Git Worktree Preparation (`cli/runtime/lifecycle.ts`)

1.  **Resolve Base Branch**:
    *   Get Task Parent ID.
    *   Exists? -> `task/<parent-id>`.
    *   Null? -> Current Branch -> `main` -> `master`.
2.  **Validate Task**:
    *   Check if `task-<id>.md` exists in the base branch. Fail if missing.
3.  **Resolve Run Branch**:
    *   Pattern: `task/<id>/<run-idx>`.
    *   Scan existing branches to find the next sequential index.
4.  **Create Worktree**:
    *   Command: `git worktree add -b <run-branch> <worktree-path> <base-branch>`.
    *   Path: `.hyperbranch/.worktrees/task-<id>-<idx>`.
5.  **Setup Artifacts**:
    *   Directory: `.hyperbranch/.current-run/`.
    *   Scaffold `docker-compose.yml`, `Dockerfile`, `entrypoint.sh`, `.env.compose`.

### 4. Environment Preparation (`cli/runtime/lifecycle.ts`)

1.  **User Mapping**: Detects host UID/GID and injects into `.env.compose` to prevent permission issues.
2.  **Env Vars**: Injects `HYPERBRANCH_TASK_ID`, `HYPERBRANCH_TASK_FILE`, etc.

### 5. Execution & Logging (`cli/utils/docker-compose.ts`)

1.  **Start**: `docker compose -p <project-name> up -d`.
    *   Project Name: `hb-<task-id>-<run-idx>`.
    *   Ports: dynamic host port mapping.
2.  **Inspect**: Queries Docker to find the assigned host port.
3.  **Logs**: Accessed via `docker compose logs -f`.

### 6. Cleanup (`hb rm`)

*   `hb rm --sweep` cleans up merged branches and dangling worktrees.
*   Safe by default: checks for active containers and unmerged commits.
*   Force (`-f`) overrides safety checks and performs deep cleanup.

## Error Handling & Logging Strategy

*   **Startup Failures**: Errors during preparation are printed to Console.
*   **Runtime Failures**: Logs are managed by Docker Compose.
*   **Debug**: Use `hb logs` to investigate runtime issues.
