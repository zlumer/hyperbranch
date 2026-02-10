import { exists } from "@std/fs/exists"
import { stringify as stringifyYaml } from "@std/yaml"
import { parse as parseYaml } from "@std/yaml/parse"
import { TaskFile, TaskFrontmatter } from "../types.ts"
import { getTaskPath } from "./tasks.ts"

export async function loadTask(id: string): Promise<TaskFile>
{
	const path = getTaskPath(id)
	if (!(await exists(path)))
	{
		throw new Error(`Task ${id} not found at ${path}`)
	}

	const content = await Deno.readTextFile(path)

	// Robust frontmatter extraction
	const match = content.match(/^---\n([\s\S]+?)\n---\n([\s\S]*)$/)

	if (!match)
	{
		throw new Error(`Task ${id} is malformed: missing frontmatter at ${path}`)
	}

	const rawYaml = match[1]
	const body = match[2]

	try
	{
		const frontmatter = parseYaml(rawYaml) as TaskFrontmatter
		return { id, path, frontmatter, body }
	} catch (e)
	{
		throw new Error(`Error parsing YAML for task ${id}: ${e}`)
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
