import { parseArgs } from "@std/cli/parse-args"
import * as Tasks from "../services/tasks.ts"
import { TaskStatus } from "../types.ts"
import { stripHbPrefix } from "../utils/branch-naming.ts"

export async function moveCommand(args: ReturnType<typeof parseArgs>)
{
	const taskId = stripHbPrefix(args._[1] as string)
	const target = stripHbPrefix(args._[2] as string)
	const fromStatus = args["from-status"] as string | undefined

	const VALID_STATUSES = ["todo", "plan", "build", "review", "done", "cancelled"]

	if (!taskId || !target)
	{
		console.error("Error: Task ID and Target (Status or New Parent ID) are required.")
		console.error(`Usage: hb move [--from-status <old-status>] <task-id> <status|parent-id>`)
		console.error(`Valid statuses: ${VALID_STATUSES.join("|")}`)
		Deno.exit(1)
	}

	try {
		const task = await Tasks.get(taskId)

		if (fromStatus)
		{
			if (task.frontmatter.status !== fromStatus)
			{
				console.error(`Error: Race condition guarded. Expected status '${fromStatus}' but found '${task.frontmatter.status}'.`)
				Deno.exit(1)
			}
		}

		if (VALID_STATUSES.includes(target))
		{
			// Status Update
			const newStatus = target as TaskStatus
			if (task.frontmatter.status !== newStatus)
			{
				const old = task.frontmatter.status
				await Tasks.update(taskId, { status: newStatus })
				console.log(`Task ${taskId} moved: ${old} -> ${newStatus}`)
			}
			else
			{
				console.log(`Task ${taskId} is already in status ${newStatus}`)
			}
		}
		else
		{
			// Reparenting
			let newParentId: string | null = target
			if (target === "root" || target === "none") {
				newParentId = null
			} else {
				// Verify parent exists
				try {
					await Tasks.get(newParentId)
				} catch {
					console.error(`Error: Invalid status or parent task not found: '${target}'`)
					Deno.exit(1)
				}
			}

			if (task.frontmatter.parent !== newParentId)
			{
				const old = task.frontmatter.parent
				await Tasks.update(taskId, { parent: newParentId })
				console.log(`Task ${taskId} reparented: ${old || "root"} -> ${newParentId || "root"}`)
			}
			else
			{
				console.log(`Task ${taskId} is already under parent ${newParentId || "root"}`)
			}
		}
	} catch (e) {
		console.error(`Error: ${e instanceof Error ? e.message : String(e)}`)
		Deno.exit(1)
	}
}
