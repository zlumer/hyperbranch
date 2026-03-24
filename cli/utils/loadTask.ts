import { access, readFile, writeFile } from "node:fs/promises"
import { stringify as stringifyYaml, parse as parseYaml } from "yaml"
import { TaskFile, TaskFrontmatter } from "../types.ts"
import { getTaskPath } from "./tasks.ts"

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function loadTask(id: string): Promise<TaskFile>
{
	const path = getTaskPath(id)
	if (!(await exists(path)))
	{
		throw new Error(`Task ${id} not found at ${path}`)
	}

	const content = await readFile(path, "utf-8")

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
	await writeFile(task.path, content)
}

export async function checkTaskExists(id: string): Promise<boolean>
{
	return await exists(getTaskPath(id))
}