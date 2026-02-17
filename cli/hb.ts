#!/usr/bin/env -S deno run -A
import { parseArgs } from "@std/cli/parse-args"
import { ensureDir } from "@std/fs"
import { TASKS_DIR } from "./utils/paths.ts"
import { createCommand } from "./commands/create.ts"
import { connectCommand } from "./commands/connect.ts"
import { moveCommand } from "./commands/move.ts"
import { runCommand } from "./commands/run.ts"
import { logsCommand } from "./commands/logs.ts"
import { stopCommand } from "./commands/stop.ts"
import { psCommand } from "./commands/ps.ts"
import { rmCommand } from "./commands/rm.ts"
import { serverCommand } from "./commands/server.ts"
import { portCommand } from "./commands/port.ts"

// --- File I/O ---

async function ensureRepo()
{
	await ensureDir(TASKS_DIR())
}

// --- Main ---

async function main()
{
	await ensureRepo()

	const args = parseArgs(Deno.args, {
		boolean: ["edit", "sweep", "force", "f", "follow"],
		string: ["parent", "depends-on", "child-of", "from-status"],
	})

	const command = args._[0]

	switch (command)
	{
		case "create":
			await createCommand(args)
			break
		case "connect":
			await connectCommand(args)
			break
		case "move":
			await moveCommand(args)
			break
		case "run":
			await runCommand(args)
			break
		case "logs":
			await logsCommand(args)
			break
		case "stop":
			await stopCommand(args)
			break
		case "ps":
			await psCommand()
			break
		case "rm":
			await rmCommand(args)
			break
		case "server":
			await serverCommand(args)
			break
		case "port":
			await portCommand(args)
			break
		default:
			console.log("Hyperbranch CLI Scaffolding")
			console.log("Commands:")
			console.log("  create [--parent <id>] [--edit] <title>")
			console.log("  connect [--depends-on <id>] [--child-of <id>] <task-id>")
			console.log("  move [--from-status <old>] <task-id> <new-status>")
			console.log("  run <task-id> [--image <image>] [--exec <cmd>]")
			console.log("  logs <task-id> <run-index> [-f|--follow]")
			console.log("  stop <task-id>")
			console.log("  rm <task-id>/<run-id>... | <task-id>... | --sweep")
			console.log("  ps")
			console.log("  server [--port <port>]")
			console.log("  port <run-id> <port>")
			break
	}
}

if (import.meta.main)
{
	main()
}
