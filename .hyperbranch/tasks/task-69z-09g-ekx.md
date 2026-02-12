---
id: 69z-09g-ekx
status: done
parent: null
dependencies: []
---
# refactor: migrate hb run to use docker compose

Migrate the `hb run` command to use `docker compose` internally instead of `docker run`. This change aims to simplify the execution environment and leverage standard Docker Compose features for orchestration.

## Plan

### 1. `cli/services/runs.ts`

-   **Disable explicit build**: Remove `Docker.buildImage` call. Rely on `docker compose run --build` (or implicit build).
-   **Env Vars**: Pass `env` to `Docker.runContainer`.
-   **Container Name**: Construct explicit container name (e.g., `hb-${taskId}-${runId}`) to pass to `Docker.runContainer`.

### 2. `cli/utils/docker.ts`

-   **Update `runContainer`**:
    -   **Generate `docker-compose.yml`**: Create this file in `runDir`.
        -   **Service**: Named `task`.
        -   **Image**: If `dockerfile` provided, use `build: { context: ".", dockerfile: "..." }`. Else `image: ...`.
        -   **Container Name**: Use the explicit name passed in config.
        -   **Volumes**: Map `config.mounts`.
        -   **Env File**: Reference `.env`.
        -   **Network**: Omit (default bridge).
    -   **Generate `.env`**: Create `.env` file in `runDir` from `config.env`.
    -   **Execute**:
        -   Use `docker compose -p <project-name> run -d --name <container-name> --remove-orphans --service-ports task`.
        -   Project name: `hb-${taskId}-${runId}`.
    -   **Capture CID**: After execution, inspect the container (by name) to get the ID and write it to `hb.cid`.

### 3. `cli/assets/run.sh`

-   **Simplify**:
    -   Remove `docker run` logic.
    -   Execute `docker compose -p ... run ...` (wait, `runContainer` executes `run.sh` which executes docker? Yes).
    -   **Wait**: `run.sh` should wait for the container to finish (using `docker wait <cid>`) to capture exit code.
    -   **Remove Log Redirection**: Do NOT redirect logs to file. Let Docker handle it.
    -   **Remove Auto-Commit**: Remove `git commit` logic as requested.
    -   **Cleanup**: Run `docker compose down -v` on exit/trap.

### 4. `cli/commands/logs.ts`

-   **Update**:
    -   Since `docker.log` file is no longer created, update `hb logs` to use `docker compose logs -f` (or `docker logs -f <cid>`).
    -   Use `Runs.getContainerId` to find the container, then stream logs using `docker logs`.

## Verification

-   Verify the generated `docker-compose.yml` content.
-   Ensure the container starts and cleanup occurs.
-   Verify `hb logs` works with the new logging mechanism.
-   Verify concurrent runs work (unique project/container names).

## Decisions

1.  **Compose Version**: `docker compose` (v2).
2.  **Concurrency**: Unique project name per run (`hb-<task>-<run>`).
3.  **Env Vars Strategy**: `.env` file.
4.  **Service Name**: Fixed `task`.
5.  **Network Mode**: Default Bridge.
6.  **Volume Cleanup**: `docker compose down -v`.
7.  **Interactive Mode**: Detached only.
8.  **Logging**: Compose Logs (no file redirection).
9.  **Container Naming**: Explicit Name (`hb-<task>-<run>`).
10. **Auto-commit**: Remove it for now.
11. **Orphan Containers**: Remove orphans (`--remove-orphans`).
12. **Build vs Image**: Prefer Build if Dockerfile exists.

## Questions

1.  **Compose Version**: Should we strictly rely on `docker compose` (v2 CLI plugin) or fallback to `docker-compose` (python/standalone)?
    -   *Answer*: `docker compose` (v2).
2.  **Concurrency & Project Name**: Should the Docker Compose project name (`-p`) include the run index (e.g., `hb-<task>-<index>`) to allow concurrent runs of the same task, or just the task ID?
    -   *Answer*: Unique per run.
3.  **Env Vars Strategy**: Should we write environment variables to a `.env` file in the run directory (cleaner) or pass them via CLI arguments to `docker compose run`?
    -   *Answer*: `.env` file.
4.  **Service Name**: Is the service name `task` fixed, or should it be configurable?
    -   *Answer*: Fixed 'task'.
5.  **Network Mode**: Should we use the default Docker network or specify `network_mode: host` / custom network?
    -   *Answer*: Default Bridge.
6.  **Volume Cleanup**: Should the cleanup step (`docker compose down`) also remove volumes (`-v`)?
    -   *Answer*: Remove Volumes.
7.  **Interactive Mode**: Does `hb run` need to support interactive TTY (`-it`) for manual intervention?
    -   *Answer*: Detached Only.
8.  **Logging**: Should we continue capturing logs to `docker.log` on the host via background process, or rely on `docker compose logs`?
    -   *Answer*: Compose Logs.
9.  **Container Naming**: Should we enforce an explicit container name (to easily find it with `docker inspect`) or rely on Compose generated names?
    -   *Answer*: Explicit Name.
10. **Auto-commit Location**: Should the auto-commit logic (git add/commit) remain in the `run.sh` wrapper script?
    -   *Answer*: Remove it for now.
11. **Orphan Containers**: Should we use `--remove-orphans` to ensure a clean state?
    -   *Answer*: Remove Orphans.
12. **Build vs Image**: If both a Dockerfile and an image argument are provided, which takes precedence in the Compose file?
    -   *Answer*: Prefer Build.
