import { join, resolve } from "@std/path";
import { getRunBranchName } from "../utils/branch-naming.ts";
import { getRunDir as getRunDirFromClone, RUNS_DIR, TASKS_DIR } from "../utils/paths.ts";
import { RunContext } from "./types.ts";

export function getRunContext(taskId: string, runIndex: number): RunContext
{
	const branchName = getRunBranchName(taskId, runIndex);
	// Replace slashes with dashes for filesystem safety
	const cloneDirName = branchName.replace(/\//g, "-");
	const clonePath = resolve(RUNS_DIR(), cloneDirName);
	const runDir = getRunDirFromClone(clonePath);
	const dockerProjectName = `hb-${taskId}-${runIndex}`;
    // Assuming a 'runs' directory under tasks for summaries
	const summaryPath = join(TASKS_DIR(), "runs", `${taskId}-${runIndex}.json`);

	return {
		taskId,
		runIndex,
		branchName,
		clonePath,
		dockerProjectName,
        summaryPath,
		paths: {
			runDir,
			composeFile: join(runDir, "docker-compose.yml"),
			envFile: join(runDir, ".env.compose"),
			entrypoint: join(runDir, "entrypoint.sh"),
			dockerfile: join(runDir, "Dockerfile"),
		},
	};
}
