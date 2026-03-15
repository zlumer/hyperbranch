import { os } from "../../../../os.ts"
import { z } from "zod"
import * as Runs from "../../../../../services/runs.ts"
import { ORPCError } from "@orpc/server"
import { parseRouteIds } from "./utils.ts"

export const post = os
  .input(z.object({ id: z.string(), runId: z.string(), strategy: z.enum(["merge", "rebase"]).optional() }))
  .handler(async ({ input }) => {
    const { runId } = parseRouteIds(input.id, input.runId)
    if (!runId) throw new ORPCError("BAD_REQUEST", { message: "Invalid run ID" })
    await Runs.pullRun(runId, input.strategy as any)
    return { message: "Pull successful" }
  })
