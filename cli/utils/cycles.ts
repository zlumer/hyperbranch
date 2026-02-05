import { loadTask } from "./loadTask.ts"
import { TaskFile } from "../types.ts"

// --- Cycle Detection ---

async function checkCycle(
	waiterId: string, 
	waiteeId: string, 
	errorMsg: (waiter: string, waitee: string) => string
) {
	const cache = new Map<string, TaskFile>()
	async function getTask(id: string) {
		if (cache.has(id)) return cache.get(id)!
		const task = await loadTask(id)
		cache.set(id, task)
		return task
	}

	// 1. Identify all ancestors of waiterId (including waiterId itself)
	// These are the nodes that, if reached from waiteeId, constitute a cycle.
	// (Because waiterId waits for waiteeId. If waiteeId leads to waiterId (or its ancestors), 
	//  then waiteeId effectively waits for waiterId).
	const ancestors = new Set<string>()
	let curr: string | null = waiterId
	while (curr) {
		if (ancestors.has(curr)) break // Prevent infinite loop if parent cycle already exists
		ancestors.add(curr)
		const task = await getTask(curr)
		curr = task.frontmatter.parent || null
	}

	// 2. Traverse dependencies of waiteeId
	const visited = new Set<string>()
	async function visit(currentId: string) {
		if (ancestors.has(currentId)) {
			throw new Error(errorMsg(waiterId, waiteeId))
		}
		if (visited.has(currentId)) return
		visited.add(currentId)

		const task = await getTask(currentId)
		// Only traverse explicit dependencies. 
		// We do NOT traverse down to children (too expensive).
		for (const depId of (task.frontmatter.dependencies || [])) {
			await visit(depId)
		}
	}

	await visit(waiteeId)
}

export async function detectDependencyCycle(sourceId: string, targetDependencyId: string) {
	// sourceId depends on targetDependencyId. sourceId waits for targetDependencyId.
	await checkCycle(sourceId, targetDependencyId, 
		(src, tgt) => `Error: Circular dependency detected. Task ${src} depends on ${tgt}, but ${tgt} already depends on (or is ancestor of) ${src}.`)
}

export async function detectParentCycle(childId: string, potentialParentId: string) {
	// potentialParentId becomes parent of childId. potentialParentId waits for childId.
	await checkCycle(potentialParentId, childId,
		(parent, child) => `Error: Circular parentage detected. Task ${parent} becomes parent of ${child}, but ${child} is already an ancestor (or dependency) of ${parent}.`)
}
