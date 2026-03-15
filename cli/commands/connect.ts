import { Args } from "@std/cli/parse-args"
import { detectDependencyCycle, detectParentCycle } from "../utils/cycles.ts"
import { loadTask, checkTaskExists, saveTask } from "../utils/loadTask.ts"
import { TaskId } from "../utils/id.ts";
import { z } from "zod";
import { parseZodArgs } from "../utils/zod.ts";

const ConnectArgsSchema = z.object({
	_: z.array(z.union([z.string(), z.number()])),
	"depends-on": z.string().optional(),
	"child-of": z.string().optional(),
})

export async function connectCommand(rawArgs: Args)
{
	const args = parseZodArgs(ConnectArgsSchema, rawArgs);
	const targetArg = args._[1] ? String(args._[1]) : undefined;
	const taskId = targetArg ? TaskId.from(targetArg) : undefined;
	const dependsOnRaw = args["depends-on"]
	const childOfRaw = args["child-of"]

	const dependsOn = dependsOnRaw ? TaskId.from(dependsOnRaw) : undefined
	const childOf = childOfRaw ? TaskId.from(childOfRaw) : undefined

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

	const task = await loadTask(taskId.id)
	let updated = false

	if (dependsOn)
	{
		if (!(await checkTaskExists(dependsOn.id)))
		{
			console.error(`Error: Dependency task ${dependsOn} does not exist.`)
			Deno.exit(1)
		}

		// Check cycle
		try {
			await detectDependencyCycle(taskId.id, dependsOn.id)
		} catch (e) {
			console.error(e instanceof Error ? e.message : String(e))
			Deno.exit(1)
		}

		if (!task.frontmatter.dependencies.includes(dependsOn.id))
		{
			task.frontmatter.dependencies.push(dependsOn.id)
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
		if (!(await checkTaskExists(childOf.id)))
		{
			console.error(`Error: Parent task ${childOf} does not exist.`)
			Deno.exit(1)
		}

		// Check cycle
		try {
			await detectParentCycle(taskId.id, childOf.id)
		} catch (e) {
			console.error(e instanceof Error ? e.message : String(e))
			Deno.exit(1)
		}

		if (task.frontmatter.parent !== childOf.id)
		{
			task.frontmatter.parent = childOf.id
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
