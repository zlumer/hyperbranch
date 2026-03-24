import { join } from "node:path"
import { readdir } from "node:fs/promises"
import { TASKS_DIR } from "./paths.ts"
import { TaskId } from "./id.ts";

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

export async function scanTasks(): Promise<TaskId[]> {
	const tasksDir = TASKS_DIR()
	const taskIds: TaskId[] = []

	try {
		const entries = await readdir(tasksDir, { withFileTypes: true })
		for (const entry of entries) {
			if (entry.isFile() && entry.name.startsWith("task-") && entry.name.endsWith(".md")) {
				// Extract ID: task-<id>.md
				const id = TaskId.from(entry.name.slice(5, -3))
				if (id) {
					taskIds.push(id)
				}
			}
		}
	} catch (e: any) {
		if (e.code !== "ENOENT") {
			throw e
		}
	}

	return taskIds
}