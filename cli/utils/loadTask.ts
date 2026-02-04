import { exists } from "jsr:@std/fs/exists"
import { stringify as stringifyYaml } from "jsr:@std/yaml"
import { parse as parseYaml } from "jsr:@std/yaml/parse"
import { TaskFile, TaskFrontmatter } from "../types.ts"
import { getTaskPath } from "./tasks.ts"

export async function loadTask(id: string): Promise<TaskFile>
{
	const path = getTaskPath(id)
	if (!(await exists(path)))
	{
		console.error(`Error: Task ${id} not found at ${path}`)
		Deno.exit(1)
	}

	const content = await Deno.readTextFile(path)

	// Robust frontmatter extraction
	const match = content.match(/^---\n([\s\S]+?)\n---\n([\s\S]*)$/)

	if (!match)
	{
		// Fallback if file is malformed (missing frontmatter), return basic structure
		console.warn(`Warning: Malformed task file ${path}, parsing best effort.`)
		return {
			id,
			path,
			frontmatter: { id, status: "todo", parent: null, dependencies: [] },
			body: content
		}
	}

	const rawYaml = match[1]
	const body = match[2]

	try
	{
		const frontmatter = parseYaml(rawYaml) as TaskFrontmatter
		return { id, path, frontmatter, body }
	} catch (e)
	{
		console.error(`Error parsing YAML for task ${id}: ${e}`)
		Deno.exit(1)
	}
}


export async function saveTask(task: TaskFile)
{
	const yaml = stringifyYaml(task.frontmatter)
	const content = `---\n${yaml}---\n${task.body}`
	await Deno.writeTextFile(task.path, content)
}

export async function checkTaskExists(id: string): Promise<boolean>
{
	return await exists(getTaskPath(id))
}
