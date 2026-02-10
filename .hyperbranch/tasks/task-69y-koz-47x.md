---
id: 69y-koz-47x
status: todo
parent: null
dependencies: []
---
# Implement Secure Deno Server with Hono & WebSockets

**Goal**: Build a robust, secure Deno server exposing CLI functionality via REST and WebSockets, sharing core logic with the CLI.

## Architecture

- **Framework**: Hono (Standard-compliant, lightweight).
- **Communication**: 
  - REST API for control/management.
  - WebSockets for real-time log streaming.
- **Security**: 
  - **Authentication**: API Key via `X-API-Key` header.
  - **Configuration**: Key set via `HB_API_KEY` (or generated on startup).
- **Configuration**:
  - Port: Default `8000`, configurable via `PORT` env or `--port` flag.
- **Response Format**: Wrapped JSON
  ```json
  {
    "success": true,
    "data": { ... },
    "error": null
  }
  ```
- **Code Structure**: Shared `services/` directory for business logic, used by both `commands/` (CLI) and `server/` (API).

## Steps

### 1. Setup & Dependencies
- [ ] Add `hono` to `cli/deno.json`.
- [ ] Create directories: `cli/services`, `cli/server/middleware`, `cli/server/routes`.

### 2. Service Layer Extraction (Refactoring)
Refactor logic from `cli/commands/` into reusable services. **Ensure `Deno.exit()` is replaced by Error throwing.**

- [ ] **`cli/services/TaskService.ts`**
  - `create(title, parentId?)`: Handle ID generation, file creation, git commit.
  - `list()`: Scan `.hyperbranch/tasks/`, parse frontmatter.
  - `get(id)`: Read and parse specific task file.
  - `update(id, updates)`: Modify frontmatter/content, handle file moves (status changes).
- [ ] **`cli/services/ExecutionService.ts`**
  - `run(id, options)`: Prepare worktree, build Docker image, start container. Return `runId` / `containerId`.
  - `stop(id)`: Locate running container (via CID file), execute `docker stop`.
  - `getLogsPath(id, runIndex)`: Resolve path to `docker.log`.
  - `getStatus(id)`: Check if container is running.
- [ ] **`cli/services/GitService.ts`**
  - Formalize `cli/utils/git.ts` into a service for easier testing/mocking.
- [ ] **Refactor CLI Commands**
  - Update `create.ts`, `run.ts`, `stop.ts`, `logs.ts`, `ps.ts` to use the new services.

### 3. Server Implementation
- [ ] **Middleware**
  - `auth.ts`: Verify `X-API-Key`.
  - `response.ts`: Wrap responses in `{ success, data, error }`.
  - `errorHandler.ts`: Global error catching.
- [ ] **REST Routes**
  - `GET /tasks`: List tasks.
  - `POST /tasks`: Create task.
  - `GET /tasks/:id`: Get task details.
  - `POST /tasks/:id/run`: Start task execution.
  - `POST /tasks/:id/stop`: Stop task execution.
- [ ] **WebSocket Routes**
  - `GET /ws/tasks/:id/logs`: Upgrade connection. Stream `docker.log` using `tail -f` logic.
- [ ] **Entrypoint**
  - `cli/server/main.ts`: Initialize app, start server (`Deno.serve`).

### 4. CLI Integration
- [ ] Create `cli/commands/server.ts`: Wrapper to launch `cli/server/main.ts`.
- [ ] Update `cli/hb.ts`: Register `server` command.

### 5. Testing
- [ ] Create `cli/tests/server_test.ts`: Integration tests for API endpoints using `app.request()`.
