import { os } from "../../../../os.ts"
import { z } from "zod"
import * as Runs from "../../../../../services/runs.ts"
import { ORPCError } from "@orpc/server"
import { parseRouteIds } from "./utils.ts"

export const get = os
  .input(z.object({ id: z.string(), runId: z.string() }))
  .handler(async ({ input }) => {
    const { runId } = parseRouteIds(input.id, input.runId)
    if (!runId) throw new ORPCError("BAD_REQUEST", { message: "Invalid run ID" })
    try {
      const port = await Runs.getHostPort(runId, 4096)
      return { port }
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new ORPCError("NOT_FOUND", { message: msg || `Run ID '${runId}' does not exist` })
    }
  })
