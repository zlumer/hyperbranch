import { join, resolve } from "@std/path"
import { exists } from "@std/fs/exists"
import { WORKTREES_DIR, getRunDir as getRunDirFromWorktree } from "./paths.ts"
import { getRunBranchName } from "./branch-naming.ts";

export function getRunDir(taskId: string, runIndex: number)
{
	const branch = getRunBranchName(taskId, runIndex)
	// Replicate logic to match how worktree paths are constructed
	const safeBranchName = branch.replace(/\//g, "-")
	const worktreePath = resolve(
		WORKTREES_DIR(),
		safeBranchName,
	)
	return getRunDirFromWorktree(worktreePath)
}

export async function getContainerId(taskId: string, runIndex: number)
{
	try
	{
		const runDir = getRunDir(taskId, runIndex); // Gets latest by default
		const cidFile = join(runDir, "hb.cid")

		if (!(await exists(cidFile)))
			return null

		const cid = (await Deno.readTextFile(cidFile)).trim()
		return cid || null
	} catch
	{
		return null
	}
}

export function getLogsPath(taskId: string, runIndex: number)
{
	const runDir = getRunDir(taskId, runIndex);
	return join(runDir, "docker.log")
}
