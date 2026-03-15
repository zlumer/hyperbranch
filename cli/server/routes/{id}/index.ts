import { os } from "../../os.ts"
import { z } from "zod"
import * as Tasks from "../../../services/tasks.ts"
import { TaskId } from "../../../utils/id.ts"
import { TaskStatus } from "../../../types.ts"
import { ORPCError } from "@orpc/server"

const TaskStatusSchema = z.enum(["todo", "plan", "build", "review", "done", "cancelled"])

export const get = os
  .input(z.object({ id: z.string() }))
  .handler(async ({ input }) => {
    const taskId = TaskId.from(input.id)
    if (!taskId) throw new ORPCError("BAD_REQUEST", { message: "Invalid task ID" })
    return await Tasks.get(taskId)
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
    await Tasks.update(taskId, data as any)
    return await Tasks.get(taskId)
  })

export const del = os
  .input(z.object({ id: z.string() }))
  .handler(async ({ input }) => {
    const taskId = TaskId.from(input.id)
    if (!taskId) throw new ORPCError("BAD_REQUEST", { message: "Invalid task ID" })
    await Tasks.remove(taskId)
    return null
  })
