---
id: 69z-b6t-onr
status: todo
parent: null
dependencies: []
---
# integrate sandbox-agent: Stage 1

Stage 1: create a minimal example of how sandbox-agent will work.

TODO:
1. Create a directory `examples/sandbox-agent/stage1`
2. Install `sandbox-agent` in this directory
3. Create a Dockerfile for the container image that will run `sandbox-agent` server
	- start from the latest mcr.microsoft.com/devcontainers/typescript-node:4-24 (or whatever the latest typescript-node is)
	- install sandbox-agent server
	- don't install any agent harnesses, this will be handled automatically at Stage 1
4. Create a `server.sh` script that builds and launches the docker container
	- expose main sandbox-agent port as a random port on the host machine
	- save the docker container id to the `sa.cid` file
	- `--rm` to cleanup on container stop
5. Create a `connect.ts` Deno script that connects to the server inside the docker container using the `sa.cid`-provided id
	- connect to the machine
	- send a "hello"
	- wait for a response and output it to stdout
	- if the script is running longer than 30sec, halt and output whatever is in the Docker log for this container
6. Create a deno test script that launches a server and checks connection step-by-step

### **Plan: Create Minimal Sandbox Agent Example**

We will create a self-contained example in `examples/sandbox-agent/stage1` that demonstrates a running `sandbox-agent` server inside Docker and a Deno client connecting to it.

#### **1. Directory Setup**
*   Create directory: `examples/sandbox-agent/stage1`
*   Create `examples/sandbox-agent/stage1/package.json` to manage local dependencies (specifically `sandbox-agent` for the client script).

#### **2. Docker Environment (`Dockerfile`)**
*   **Base Image:** `mcr.microsoft.com/devcontainers/typescript-node:22` (as requested and verified).
*   **Installation:**
    *   Install `sandbox-agent` globally via npm: `npm install -g sandbox-agent`.
    *   *Note:* We will **not** install any specific agent harnesses (Claude, Codex, etc.) inside the image, following the "No Agents" instruction. We will rely on the `mock` agent or basic server health checks for verification.
*   **Configuration:**
    *   Expose port `2468` (default `sandbox-agent` port).
    *   Entrypoint/CMD: Start the server with `sandbox-agent server --host 0.0.0.0 --port 2468 --no-token`.

#### **3. Server Launch Script (`server.sh`)**
*   **Build:** Run `docker build` to create the image `sandbox-agent-stage1`.
*   **Run:** Start the container in detached mode (`-d`) with `--rm`.
*   **Port Mapping:** Use `-P` to publish all exposed ports to random host ports.
*   **CID:** Save the container ID to `sa.cid` in the same directory.
*   **Output:** Print the container ID and the mapped port for `2468` to stdout.

#### **4. Client Script (`connect.ts`)**
*   **Runtime:** Deno (using `npm:` specifiers for `sandbox-agent` SDK).
*   **Logic:**
    1.  Read the container ID from `sa.cid`.
    2.  Determine the host port for `2468` using `docker port <cid> 2468`.
    3.  Connect to the server using `SandboxAgent.connect()`.
    4.  **Verification:**
        *   Check server health (`/v1/health` or SDK equivalent).
        *   Attempt to create a session with the `mock` agent (if available) and send "hello".
        *   If `mock` is unavailable, verify connection by listing available agents.
    5.  **Timeout:** Implement a 30-second timeout. If exceeded, read and output the Docker logs for the container before exiting with error.

#### **5. Test Script (`test.ts`)**
*   **Role:** An overarching Deno test script to automate the verification.
*   **Steps:**
    1.  Execute `server.sh`.
    2.  Wait briefly for the server to start.
    3.  Run `connect.ts` and capture its output.
    4.  Assert that `connect.ts` completed successfully and established a connection.
    5.  **Cleanup:** Stop the docker container using the ID in `sa.cid`.

### **Verification**
*   Run the `test.ts` script.
*   Success is defined by the client script successfully performing a handshake with the `sandbox-agent` server running inside the container.

**Dependencies:**
*   `sandbox-agent` (NPM) will be used in both the Docker image (server) and the local `package.json` (client SDK).
