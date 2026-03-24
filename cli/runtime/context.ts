import { join, resolve } from "node:path";
import { getRunDir as getRunDirFromClone, RUNS_DIR, TASKS_DIR } from "../utils/paths.ts";
import { RunContext } from "./types.ts";
import { RunId } from "../utils/id.ts";

export function getRunContext(run: RunId): RunContext
{
	const branchName = run.toBranchName();
	// Replace slashes with dashes for filesystem safety
	const cloneDirName = branchName.replace(/\//g, "-");
	const clonePath = resolve(RUNS_DIR(), cloneDirName);
	const runDir = getRunDirFromClone(clonePath);
	const dockerProjectName = run.toDirectorySlug()
    // Assuming a 'runs' directory under tasks for summaries
	const summaryPath = join(TASKS_DIR(), "runs", `${run.toDirectorySlug()}.json`);

	return {
		runId: run,
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
