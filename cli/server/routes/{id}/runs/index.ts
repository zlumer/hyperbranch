import { os } from "../../../os.js"
import { z } from "zod"
import * as Runs from "../../../../services/runs.js"
import { TaskId } from "../../../../utils/id.js"
import { ORPCError } from "@orpc/server"

export const get = os
  .input(z.object({ id: z.string() }))
  .handler(async ({ input }) => {
    const taskId = TaskId.from(input.id)
    if (!taskId) throw new ORPCError("BAD_REQUEST", { message: "Invalid task ID" })
    try {
      return await Runs.listRuns(taskId)
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        throw new ORPCError("NOT_FOUND", { message: error.message })
      }
      throw error
    }
  })
