#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run --allow-env
import { parseArgs } from "@std/cli/parse-args"
import { ensureDir } from "@std/fs"
import { TASKS_DIR } from "./utils/tasks.ts"
import { createCommand } from "./commands/create.ts"
import { connectCommand } from "./commands/connect.ts"
import { moveCommand } from "./commands/move.ts"

// --- File I/O ---

async function ensureRepo()
{
	await ensureDir(TASKS_DIR)
}

// --- Main ---

async function main()
{
	await ensureRepo()

	const args = parseArgs(Deno.args, {
		boolean: ["edit"],
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
		default:
			console.log("Hyperbranch CLI Scaffolding")
			console.log("Commands:")
			console.log("  create [--parent <id>] [--edit] <title>")
			console.log("  connect [--depends-on <id>] [--child-of <id>] <task-id>")
			console.log("  move [--from-status <old>] <task-id> <new-status>")
			break
	}
}

if (import.meta.main)
{
	main()
}

