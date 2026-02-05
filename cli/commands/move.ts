import { parseArgs } from "@std/cli/parse-args"
import { TaskStatus } from "../types.ts"
import { loadTask, saveTask } from "../utils/loadTask.ts"

export async function moveCommand(args: ReturnType<typeof parseArgs>)
{
	const taskId = args._[1] as string
	const newStatus = args._[2] as TaskStatus
	const fromStatus = args["from-status"] as string | undefined

	const VALID_STATUSES = ["todo", "in_progress", "review", "done", "cancelled"]

	if (!taskId || !newStatus)
	{
		console.error("Error: Task ID and New Status are required.")
		console.error(`Usage: ./hb.ts move [--from-status <old-status>] <task-id> <new-status>`)
		console.error(`Valid statuses: ${VALID_STATUSES.join("|")}`)
		Deno.exit(1)
	}

	if (!VALID_STATUSES.includes(newStatus))
	{
		console.error(`Error: Invalid status '${newStatus}'.`)
		console.error(`Valid statuses: ${VALID_STATUSES.join("|")}`)
		Deno.exit(1)
	}

	const task = await loadTask(taskId)

	if (fromStatus)
	{
		if (task.frontmatter.status !== fromStatus)
		{
			console.error(`Error: Race condition guarded. Expected status '${fromStatus}' but found '${task.frontmatter.status}'.`)
			Deno.exit(1)
		}
	}

	if (task.frontmatter.status !== newStatus)
	{
		const old = task.frontmatter.status
		task.frontmatter.status = newStatus
		await saveTask(task)
		console.log(`Task ${taskId} moved: ${old} -> ${newStatus}`)
	}
	else
	{
		console.log(`Task ${taskId} is already in status ${newStatus}`)
	}
}
