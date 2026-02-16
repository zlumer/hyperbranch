import { join, resolve } from "@std/path";
import { getRunBranchName } from "../utils/branch-naming.ts";
import { getRunDir as getRunDirFromWorktree, RUN_DIR_NAME, WORKTREES_DIR } from "../utils/paths.ts";
import { RunContext } from "./types.ts";

export function getRunContext(taskId: string, runIndex: number): RunContext
{
	const branchName = getRunBranchName(taskId, runIndex);
	// Replace slashes with dashes for filesystem safety
	const worktreeDirName = branchName.replace(/\//g, "-");
	const worktreePath = resolve(WORKTREES_DIR(), worktreeDirName);
	const runDir = getRunDirFromWorktree(worktreePath);
	const dockerProjectName = `hb-${taskId}-${runIndex}`;

	return {
		taskId,
		runIndex,
		branchName,
		worktreePath,
		dockerProjectName,
		paths: {
			runDir,
			composeFile: join(runDir, "docker-compose.yml"),
			envFile: join(runDir, ".env.compose"),
			entrypoint: join(runDir, "entrypoint.sh"),
			dockerfile: join(runDir, "Dockerfile"),
		},
	};
}
