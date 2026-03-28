import { os } from "../../../os.js"
import { z } from "zod"
import * as Runs from "../../../../services/runs.js"
import { TaskId } from "../../../../utils/id.js"
import { ORPCError } from "@orpc/server"

export const get = os
  .input(z.object({ id: z.string() }))
  .handler(async function* ({ input }) {
    const taskId = TaskId.from(input.id)
    if (!taskId) throw new ORPCError("BAD_REQUEST", { message: "Invalid task ID" })
    while (true) {
      try {
        const runs = await Runs.listRuns(taskId)
        yield { type: "runs_update", data: runs }
      } catch (e) {}
      await new Promise(r => setTimeout(r, 2000))
    }
  })
