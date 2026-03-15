import { Args } from "@std/cli/parse-args"
import * as Tasks from "../services/tasks.ts"
import { z } from "zod";
import { parseZodArgs } from "../utils/zod.ts";

const CreateArgsSchema = z.object({
	_: z.array(z.union([z.string(), z.number()])),
	edit: z.boolean().optional(),
	parent: z.string().optional(),
})

// --- Commands ---
export async function createCommand(rawArgs: Args)
{
	const args = parseZodArgs(CreateArgsSchema, rawArgs);
	const edit = args.edit || false
	const parentId = args.parent

	// Title is the rest of the arguments joined
	// args._[0] is 'create', so slice 1
	const titleParts = args._.slice(1)
	if (titleParts.length === 0)
	{
		console.error("Error: Task title is required.")
		console.error("Usage: ./hb.ts create [--parent <id>] [--edit] \"Task Title\"")
		Deno.exit(1)
	}
	const title = titleParts.join(" ")

	try {
		const task = await Tasks.create(title, parentId)

		console.log(`Task created: ${task.id}`)
		console.log(`Path: ${task.path}`)

		if (edit)
		{
			const editor = Deno.env.get("EDITOR") || "vim"
			const p = new Deno.Command(editor, {
				args: [task.path],
				stdin: "inherit",
				stdout: "inherit",
				stderr: "inherit",
			})
			await p.output()
		}
	} catch (error) {
		console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
		Deno.exit(1)
	}
}
