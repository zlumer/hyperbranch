import { os } from "../../os.ts"
import { z } from "zod"
import * as Runs from "../../../services/runs.ts"
import { TaskId, RunId } from "../../../utils/id.ts"
import { ORPCError } from "@orpc/server"
import { createOpencodeClient } from "npm:@opencode-ai/sdk"

export const post = os
  .input(z.object({
    id: z.string(),
    prompt: z.string().optional(),
    agentMode: z.string().optional(),
  }).passthrough())
  .handler(async ({ input }) => {
    const { id, prompt, agentMode, ...body } = input
    const taskId = TaskId.from(id)
    if (!taskId) throw new ORPCError("BAD_REQUEST", { message: "Invalid task ID" })
    try {
      const result = await Runs.run(taskId, body)
      if (prompt) {
        (async () => {
          const { runId, port } = result
          const timeout = 120000
          const startTime = Date.now()
          let healthy = false
          while (Date.now() - startTime < timeout) {
            try {
              const res = await fetch(`http://localhost:${port}/global/health`)
              if (res.ok && (await res.json()).healthy) { healthy = true; break; }
            } catch (_) {}
            await new Promise((r) => setTimeout(r, 2000))
          }
          if (!healthy) {
            const runObj = RunId.fromString(runId)
            if (runObj) await Runs.stopRun(runObj).catch(() => {})
            return
          }
          try {
            const client = createOpencodeClient({ baseUrl: `http://localhost:${port}` })
            const session = await client.session.create({})
            if (session.error) throw new Error(JSON.stringify(session.error))
            const sessionId = session.data.id
            await client.session.prompt({
              path: { id: sessionId },
              body: { agent: agentMode || "build", parts: [{ type: "text", text: prompt }] }
            })
          } catch (e) {
            const runObj = RunId.fromString(runId)
            if (runObj) await Runs.stopRun(runObj).catch(() => {})
          }
        })()
      }
      return result
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        throw new ORPCError("NOT_FOUND", { message: error.message })
      }
      throw error
    }
  })
