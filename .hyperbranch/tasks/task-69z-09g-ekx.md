---
id: 69z-09g-ekx
status: todo
parent: null
dependencies: []
---
# refactor: migrate hb run to use docker compose

Migrate the `hb run` command to use `docker compose` internally instead of `docker run`. This change aims to simplify the execution environment and leverage standard Docker Compose features for orchestration.

## Plan

### 1. `cli/services/runs.ts`

-   **Disable explicit build**: `docker compose run` will handle the build process if a Dockerfile is present.
-   Remove the explicit `Docker.buildImage` call.

### 2. `cli/utils/docker.ts`

-   **Update `runContainer`**:
    -   Generate a `docker-compose.yml` file in the run directory before executing the script.
    -   Define a service named `task`.
    -   Map `config.mounts` to `volumes` in the YAML file.
    -   Set `image`, `user`, and `working_dir`.
    -   If `config.dockerfile` exists, add `build: { context: ".", dockerfile: "..." }`.
    -   Update `HB_ARGS` generation to *exclude* mounts (since they are now in YAML) but *keep* environment variables (passed via CLI).

### 3. `cli/assets/run.sh`

-   **Capture Arguments**: Save the command arguments (e.g., `npm start`) before processing internal flags.
-   **Switch to Compose**: Execute `docker compose run` with the generated file.
-   **Isolation**: Use `-p "$HB_TASK_ID"` for project name.
-   **Container Name**: Force container name with `--name` to retrieve CID via `docker inspect`.
-   **Cleanup**: Implement cleanup using `docker compose down`.
-   **Logging**: Ensure logs are still captured correctly.

## Verification

-   Verify the generated `docker-compose.yml` content.
-   Ensure the container starts, logs are captured, and cleanup occurs.
-   Verify that `git commit` behavior (on success) is preserved.
