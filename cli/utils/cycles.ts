import { loadTask } from "./loadTask.ts"

// --- Cycle Detection ---
export async function detectDependencyCycle(sourceId: string, targetDependencyId: string)
{
	// We are adding targetDependencyId to sourceId.
	// Check if sourceId exists in targetDependencyId's dependency tree.
	const visited = new Set<string>()

	async function visit(currentId: string)
	{
		if (currentId === sourceId)
		{
			console.error(`Error: Circular dependency detected. Task ${sourceId} is already a dependency of ${targetDependencyId} (or its chain).`)
			Deno.exit(1)
		}
		if (visited.has(currentId))
			return

		visited.add(currentId)

		const task = await loadTask(currentId)
		for (const depId of (task.frontmatter.dependencies || []))
		{
			await visit(depId)
		}
	}

	await visit(targetDependencyId)
}
export async function detectParentCycle(childId: string, potentialParentId: string)
{
	// We are setting childId.parent = potentialParentId.
	// Check if childId is an ancestor of potentialParentId.
	let curr = potentialParentId
	while (curr)
	{
		if (curr === childId)
		{
			console.error(`Error: Circular parentage detected. Task ${childId} is an ancestor of ${potentialParentId}.`)
			Deno.exit(1)
		}
		const task = await loadTask(curr)
		if (!task.frontmatter.parent)
			break
		
		curr = task.frontmatter.parent
	}
}
