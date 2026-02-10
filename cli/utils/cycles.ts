import { loadTask as defaultLoadTask } from "./loadTask.ts"
import { TaskFile } from "../types.ts"

// --- Cycle Detection ---

export type LoadTaskFn = (id: string) => Promise<TaskFile>

// Helper to get dependencies as per spec
// Only strictly enforce explicit dependencies.
function getDependencies(task: TaskFile): string[] {
	return task.frontmatter.dependencies || []
}

async function checkCycle(
	sourceId: string, 
	targetId: string, 
	errorMsg: (source: string, target: string) => string,
	loadTask: LoadTaskFn = defaultLoadTask
) {
	const cache = new Map<string, TaskFile>()
	async function getTask(id: string) {
		if (cache.has(id)) return cache.get(id)!
		const task = await loadTask(id)
		cache.set(id, task)
		return task
	}

	// 1. Identify all ancestors of sourceId
	// These are the nodes that, if reached from targetId, constitute a cycle.
	// (Because sourceId depends on targetId. If targetId leads to sourceId (or its ancestors), 
	//  then targetId effectively depends on sourceId).
	const ancestors = new Set<string>()
	let curr: string | null = sourceId
	while (curr) {
		if (ancestors.has(curr)) break // Prevent infinite loop if parent cycle already exists
		ancestors.add(curr)
		try {
			const task = await getTask(curr)
			curr = task.frontmatter.parent || null
		} catch {
			// If we can't load an ancestor, stop traversing up
			break
		}
	}

	// 2. Traverse dependencies of targetId
	const visited = new Set<string>()
	async function visit(currentId: string) {
		if (ancestors.has(currentId)) {
			throw new Error(errorMsg(sourceId, targetId))
		}
		if (visited.has(currentId)) return
		visited.add(currentId)

		let task: TaskFile
		try {
			task = await getTask(currentId)
		} catch {
			// If we can't load a dependency, stop traversing this branch
			return
		}

		// Only traverse explicit dependencies. 
		// We do NOT traverse down to children (too expensive).
		for (const depId of getDependencies(task)) {
			await visit(depId)
		}
	}

	await visit(targetId)
}

export async function detectDependencyCycle(taskId: string, newDepId: string, loadTask: LoadTaskFn = defaultLoadTask) {
	// taskId depends on newDepId.
	// Check if newDepId reaches taskId.
	await checkCycle(taskId, newDepId, 
		(src, tgt) => `Error: Circular dependency detected. Task ${src} depends on ${tgt}, but ${tgt} already depends on (or is ancestor of) ${src}.`,
		loadTask)
}

export async function detectParentCycle(childId: string, newParentId: string, loadTask: LoadTaskFn = defaultLoadTask) {
	// childId is child of newParentId.
	// This implies newParentId depends on childId.
	// Check if childId reaches newParentId.
	await checkCycle(newParentId, childId,
		(parent, child) => `Error: Circular parentage detected. Task ${parent} becomes parent of ${child}, but ${child} is already an ancestor (or dependency) of ${parent}.`,
		loadTask)
}
