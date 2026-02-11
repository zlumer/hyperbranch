---
id: 69z-1op-pto
status: todo
parent: null
dependencies: []
---
# Integrate rivet-dev/sandbox-agent

Integrate `rivet-dev/sandbox-agent` to replace the current custom agent implementation. This will allow running standard coding agents (Claude Code, Codex, OpenCode) in a secure sandbox environment controlled via a unified HTTP API.

## Plan

1.  **Dependencies**: Add `sandbox-agent` SDK to `cli/deno.json`.
2.  **Docker Environment**:
    -   Update `cli/assets/Dockerfile` to install `sandbox-agent` and pre-install agents (`opencode`, `claude`, `codex`).
    -   Update `cli/assets/run.sh` to start the `sandbox-agent` server instead of the direct task command.
    -   Remove legacy git commit logic from `run.sh`.
3.  **Docker Utilities**:
    -   Update `cli/utils/docker.ts` to support port mapping.
    -   Implement `getContainerPort` to discover the ephemeral host port for the agent server.
4.  **Run Service**:
    -   Rewrite `cli/services/runs.ts` to use `SandboxAgent` SDK.
    -   Implement connection to the local agent server.
    -   Support creating sessions with different agents (`--agent`).
    -   Implement streaming of events to console and `transcript.jsonl`.
    -   Implement interactive chat loop (stdin -> agent).
    -   Handle task completion and execute git commit on the host.
5.  **CLI Command**:
    -   Update `cli/commands/run.ts` to add `--agent` and `--inspector` flags.

## Verification
-   `docker build` succeeds.
-   CLI connects to `sandbox-agent` server.
-   Simple task execution works (file creation, git commit).
-   Interactive chat works.
