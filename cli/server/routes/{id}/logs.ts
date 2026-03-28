import { os } from "../../os.js"
import { z } from "zod"
import * as Runs from "../../../services/runs.js"
import { TaskId } from "../../../utils/id.js"
import { ORPCError } from "@orpc/server"

export const get = os
  .input(z.object({ id: z.string() }))
  .handler(async function* ({ input }) {
    const taskId = TaskId.from(input.id)
    if (!taskId) throw new ORPCError("BAD_REQUEST", { message: "Invalid task ID" })
    const runId = await Runs.getLatestRunId(taskId)
    if (!runId) throw new ORPCError("NOT_FOUND", { message: "Run not found" })
    const child = await Runs.getLogsStream(runId, true)
    const stream = child.stdout || child.stderr
    if (!stream) return
    const decoder = new TextDecoder()
    for await (const chunk of stream) {
      const text = decoder.decode(chunk)
      for (const line of text.split("\n")) { if (line) yield { data: line } }
    }
  })
