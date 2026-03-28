import { os } from "../../../../os.js"
import { z } from "zod"
import * as Runs from "../../../../../services/runs.js"
import { ORPCError } from "@orpc/server"
import { parseRouteIds } from "./utils.js"

export const get = os
  .input(z.object({ id: z.string(), runId: z.string() }))
  .handler(async function* ({ input }) {
    const { runId } = parseRouteIds(input.id, input.runId)
    if (!runId) throw new ORPCError("BAD_REQUEST", { message: "Invalid run ID" })
    const child = await Runs.getLogsStream(runId, true)
    const stream = child.stdout || child.stderr
    if (!stream) return
    const decoder = new TextDecoder()
    for await (const chunk of stream) {
      const text = decoder.decode(chunk)
      for (const line of text.split("\n")) { if (line) yield { data: line } }
    }
  })
