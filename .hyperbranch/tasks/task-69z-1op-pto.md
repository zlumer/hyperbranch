---
id: 69z-1op-pto
status: todo
parent: null
dependencies: []
---
# Integrate rivet-dev/sandbox-agent

Integrate `rivet-dev/sandbox-agent` to replace the current custom agent implementation. This will allow running standard coding agents (Claude Code, Codex, OpenCode) in a secure sandbox environment controlled via a unified HTTP API.

## Detailed Plan

1.  **Dependencies**: Add `sandbox-agent` SDK to `cli/deno.json`.
2.  **Docker Environment**:
    -   Update `cli/assets/Dockerfile` to install `sandbox-agent` (curl install) and pre-install agents (`opencode`, `claude`, `codex`).
    -   Update `cli/assets/run.sh` to start the `sandbox-agent` server (`sandbox-agent server --host 0.0.0.0 --port 2468 --no-token`) instead of the direct task command.
    -   Remove legacy git commit logic from `run.sh` (commits will now be driven by the host CLI).
3.  **Docker Utilities**:
    -   Update `cli/utils/docker.ts`:
        -   Update `DockerConfig` interface to include `ports?: Record<string, string | null>` (e.g., `{"2468/tcp": null}` for random host port).
        -   Update `runContainer` to include `-p` flags in `HB_ARGS`.
        -   Implement `getContainerPort(cid: string, internalPort: number): Promise<number>` using `docker port` to find the mapped host port.
        -   Implement `exec(cid: string, command: string[]): Promise<void>` for running commands inside the container (e.g., git).
4.  **Run Service Refactor (`cli/services/runs.ts`)**:
    -   **`run()`**: Should now only launch the container in the background and return `{ runId, containerId }`.
    -   **`connectAndMonitor(taskId: string, agentName: string, showInspector: boolean)`**:
        -   Get the container ID for the task.
        -   Discover the host port for 2468 using `getContainerPort`.
        -   Connect using `SandboxAgent.connect("http://localhost:<port>")`.
        -   Create a session with the specified agent.
        -   **Streaming**: Stream events to console (human-readable) and append raw JSON to `join(runDir, "transcript.jsonl")`.
        -   **Interaction**: Start a parallel `Deno.stdin` reader loop to send user messages to the agent via `postMessage`.
        -   **Inspector**: If `--inspector` is set, print the UI URL (`http://localhost:<inspector_port>/ui/`).
        -   **Completion**: On "completion" event (or clean exit), execute `git add . && git commit` on the host.
        -   **Cleanup**: Stop the container after successful completion (unless `--keep` or similar logic is added later).
5.  **CLI Command**:
    -   Update `cli/commands/run.ts`:
        -   Add `--agent <name>` (default: `opencode`) and `--inspector` flags.
        -   Call `Runs.run` to start the container.
        -   Call `Runs.connectAndMonitor` to attach and interact.

## Verification
-   `docker build` succeeds with the new agent installation.
-   CLI successfully connects to `sandbox-agent` server.
-   Simple task execution works (file creation inside container, git commit on host).
-   Interactive chat (stdin -> agent) works correctly.
-   Inspector UI is accessible if requested.
