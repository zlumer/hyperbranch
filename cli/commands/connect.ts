import { parseArgs } from "@std/cli/parse-args"
import { detectDependencyCycle, detectParentCycle } from "../utils/cycles.ts"
import { loadTask, checkTaskExists, saveTask } from "../utils/loadTask.ts"
import { stripHbPrefix } from "../utils/branch-naming.ts"

export async function connectCommand(args: ReturnType<typeof parseArgs>)
{
	const taskId = stripHbPrefix(args._[1] as string)
	const dependsOnRaw = args["depends-on"] as string | undefined
	const childOfRaw = args["child-of"] as string | undefined

	const dependsOn = dependsOnRaw ? stripHbPrefix(dependsOnRaw) : undefined
	const childOf = childOfRaw ? stripHbPrefix(childOfRaw) : undefined

	if (!taskId)
	{
		console.error("Error: Target task ID is required.")
		console.error("Usage: ./hb.ts connect [--depends-on <id>] [--child-of <id>] <task-id>")
		Deno.exit(1)
	}

	if (!dependsOn && !childOf)
	{
		console.error("Error: Must specify either --depends-on or --child-of.")
		Deno.exit(1)
	}

	const task = await loadTask(taskId)
	let updated = false

	if (dependsOn)
	{
		if (!(await checkTaskExists(dependsOn)))
		{
			console.error(`Error: Dependency task ${dependsOn} does not exist.`)
			Deno.exit(1)
		}

		// Check cycle
		try {
			await detectDependencyCycle(taskId, dependsOn)
		} catch (e) {
			console.error(e instanceof Error ? e.message : String(e))
			Deno.exit(1)
		}

		if (!task.frontmatter.dependencies.includes(dependsOn))
		{
			task.frontmatter.dependencies.push(dependsOn)
			updated = true
			console.log(`Added dependency: ${dependsOn}`)
		}
		else
		{
			console.log(`Dependency ${dependsOn} already exists.`)
		}
	}

	if (childOf)
	{
		if (!(await checkTaskExists(childOf)))
		{
			console.error(`Error: Parent task ${childOf} does not exist.`)
			Deno.exit(1)
		}

		// Check cycle
		try {
			await detectParentCycle(taskId, childOf)
		} catch (e) {
			console.error(e instanceof Error ? e.message : String(e))
			Deno.exit(1)
		}

		if (task.frontmatter.parent !== childOf)
		{
			task.frontmatter.parent = childOf
			updated = true
			console.log(`Set parent: ${childOf}`)
		}
		else
		{
			console.log(`Parent is already ${childOf}`)
		}
	}

	if (updated)
	{
		await saveTask(task)
	}
}
