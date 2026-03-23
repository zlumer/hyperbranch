import { os } from "../../os.ts"
import { z } from "zod"
import * as Runs from "../../../services/runs.ts"
import { TaskId, RunId } from "../../../utils/id.ts"
import { ORPCError } from "@orpc/server"
import { getOpencodeService } from "../../../services/opencode.ts"

export const post = os
  .input(z.object({
    id: z.string(),
    prompt: z.string().optional(),
    agentMode: z.string().optional(),
    model: z.string().optional(),
  }).passthrough())
  .handler(async ({ input }) => {
    const { id, prompt, agentMode, model, ...body } = input
    const taskId = TaskId.from(id)
    if (!taskId) throw new ORPCError("BAD_REQUEST", { message: "Invalid task ID" })
    try {
      const result = await Runs.run(taskId, body)
      if (prompt) {
        (async () => {
          const { runId, port } = result
          const service = getOpencodeService(port)
          const timeout = 120000
          const startTime = Date.now()
          
          while (Date.now() - startTime < timeout) {
            if (service.currentState() !== "offline") break
            await new Promise((r) => setTimeout(r, 2000))
          }
          
          if (service.currentState() === "offline") {
            const runObj = RunId.fromString(runId)
            if (runObj) await Runs.stopRun(runObj).catch(() => {})
			throw new Error("Opencode service is offline after waiting for 2 minutes. Stopping run and aborting prompt execution.")
            return
          }
          
          service.queueAction(async () => {
            try {
              await service.createSessionWithPrompt(prompt, { agentMode, model })
            } catch (e) {
              const runObj = RunId.fromString(runId)
              if (runObj) await Runs.stopRun(runObj).catch(() => {})
            }
          })
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
