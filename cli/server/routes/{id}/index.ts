import { os } from "../../os.js"
import { z } from "zod"
import * as Tasks from "../../../services/tasks.js"
import { TaskId } from "../../../utils/id.js"
import { TaskStatus } from "../../../types.js"
import { ORPCError } from "@orpc/server"

const TaskStatusSchema = z.enum(["todo", "plan", "build", "review", "done", "cancelled"])

export const get = os
  .input(z.object({ id: z.string() }))
  .handler(async ({ input }) => {
    const taskId = TaskId.from(input.id)
    if (!taskId) throw new ORPCError("BAD_REQUEST", { message: "Invalid task ID" })
    try {
      return await Tasks.get(taskId)
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        throw new ORPCError("NOT_FOUND", { message: error.message })
      }
      throw error
    }
  })

export const patch = os
  .input(z.object({
    id: z.string(),
    title: z.string().optional(),
    description: z.string().optional(),
    status: TaskStatusSchema.optional(),
  }))
  .handler(async ({ input }) => {
    const taskId = TaskId.from(input.id)
    if (!taskId) throw new ORPCError("BAD_REQUEST", { message: "Invalid task ID" })
    const { id, ...data } = input
    try {
      await Tasks.update(taskId, data)
      return await Tasks.get(taskId)
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        throw new ORPCError("NOT_FOUND", { message: error.message })
      }
      throw error
    }
  })

export const del = os
  .input(z.object({ id: z.string() }))
  .handler(async ({ input }) => {
    const taskId = TaskId.from(input.id)
    if (!taskId) throw new ORPCError("BAD_REQUEST", { message: "Invalid task ID" })
    await Tasks.remove(taskId)
    return null
  })
