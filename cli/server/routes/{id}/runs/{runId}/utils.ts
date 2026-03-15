import { TaskId, RunId } from "../../../../../utils/id.ts"

export function parseRouteIds(idStr: string, runIdStr: string) {
  const taskId = TaskId.from(idStr)
  let runId = RunId.fromString(runIdStr)
  if (!runId && taskId && !isNaN(Number(runIdStr))) {
    runId = taskId.toRunId(Number(runIdStr))
  }
  return { taskId, runId }
}
