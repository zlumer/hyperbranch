import { os } from "../../../../os.js"
import { z } from "zod"
import * as Runs from "../../../../../services/runs.js"
import { ORPCError } from "@orpc/server"
import { parseRouteIds } from "./utils.js"

export const post = os
  .input(z.object({ id: z.string(), runId: z.string() }))
  .handler(async ({ input }) => {
    const { runId } = parseRouteIds(input.id, input.runId)
    if (!runId) throw new ORPCError("BAD_REQUEST", { message: "Invalid run ID" })
    await Runs.stopRun(runId)
    return { message: "Task stopped" }
  })
