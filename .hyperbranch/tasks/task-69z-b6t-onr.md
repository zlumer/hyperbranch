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

