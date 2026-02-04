import { join } from "jsr:@std/path"

// --- Configuration ---
export const TASKS_DIR = join(Deno.cwd(), ".hyperbranch/tasks")

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
	return join(TASKS_DIR, `task-${id}.md`)
}
