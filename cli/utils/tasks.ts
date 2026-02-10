import { join } from "@std/path"
import { TASKS_DIR } from "./paths.ts"

// --- Configuration ---
export { TASKS_DIR }

// --- ID Generation ---
export function generateTaskId(): string
{
	const now = Date.now()
	// 0-9 random
	const rnd = Math.floor(Math.random() * 10)
	// mathematical addition to end
	const numId = now * 10 + rnd
	// base36, pad 9, dash format
	const base36 = numId.toString(36).padStart(9, "0")
	return base36.replace(/.{3}(?!$)/g, "$&-")
}
export function getTaskPath(id: string): string
{
	return join(TASKS_DIR(), `task-${id}.md`)
}

export async function scanTasks(): Promise<string[]> {
	const tasksDir = TASKS_DIR()
	const taskIds: string[] = []

	try {
		for await (const entry of Deno.readDir(tasksDir)) {
			if (entry.isFile && entry.name.startsWith("task-") && entry.name.endsWith(".md")) {
				// Extract ID: task-<id>.md
				const id = entry.name.slice(5, -3)
				if (id) {
					taskIds.push(id)
				}
			}
		}
	} catch (e) {
		if (!(e instanceof Deno.errors.NotFound)) {
			throw e
		}
	}

	return taskIds
}
