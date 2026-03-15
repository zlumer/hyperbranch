import { os } from "../../../os.ts"
import { z } from "zod"
import * as Runs from "../../../../services/runs.ts"
import { TaskId } from "../../../../utils/id.ts"
import { ORPCError } from "@orpc/server"

export const get = os
  .input(z.object({ id: z.string() }))
  .handler(async ({ input }) => {
    const taskId = TaskId.from(input.id)
    if (!taskId) throw new ORPCError("BAD_REQUEST", { message: "Invalid task ID" })
    return await Runs.listRuns(taskId)
  })
