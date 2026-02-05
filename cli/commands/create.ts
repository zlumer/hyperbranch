import { parseArgs } from "@std/cli/parse-args"
import { TaskFile } from "../types.ts"
import { checkTaskExists, saveTask } from "../utils/loadTask.ts"
import { generateTaskId, getTaskPath } from "../utils/tasks.ts"

// --- Commands ---
export async function createCommand(args: ReturnType<typeof parseArgs>)
{
	const edit = args.edit || false
	const parentId = args.parent as string | undefined

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

	if (parentId)
	{
		if (!(await checkTaskExists(parentId)))
		{
			console.error(`Error: Parent task ${parentId} does not exist.`)
			Deno.exit(1)
		}
	}

	const id = generateTaskId()
	const task: TaskFile = {
		id,
		path: getTaskPath(id),
		frontmatter: {
			id,
			status: "todo",
			parent: parentId || null,
			dependencies: []
		},
		body: `# ${title}\n\n`
	}

	await saveTask(task)
	console.log(`Task created: ${id}`)
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
}
