import { os } from "../../../../os.ts"
import { z } from "zod"
import * as Runs from "../../../../../services/runs.ts"
import { ORPCError } from "@orpc/server"
import { parseRouteIds } from "./utils.ts"

export const del = os
  .input(z.object({ id: z.string(), runId: z.string(), force: z.string().optional().transform(v => v === "true") }))
  .handler(async ({ input }) => {
    const { runId } = parseRouteIds(input.id, input.runId)
    if (!runId) throw new ORPCError("BAD_REQUEST", { message: "Invalid run ID" })
    await Runs.removeRun(runId, input.force)
    return { message: "Run removed" }
  })
