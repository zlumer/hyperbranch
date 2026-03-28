import { os } from "../../../../os.js"
import { z } from "zod"
import * as Runs from "../../../../../services/runs.js"
import { ORPCError } from "@orpc/server"
import { parseRouteIds } from "./utils.js"

export const post = os
  .input(z.object({ id: z.string(), runId: z.string(), strategy: z.enum(["merge", "squash", "ff"]).optional(), cleanup: z.boolean().optional() }))
  .handler(async ({ input }) => {
    const { runId } = parseRouteIds(input.id, input.runId)
    if (!runId) throw new ORPCError("BAD_REQUEST", { message: "Invalid run ID" })
    await Runs.mergeRun(runId, input.strategy as any, input.cleanup)
    return { message: "Merge successful" }
  })
