import { os } from "../os.ts"
import { z } from "zod"
import * as Tasks from "../../services/tasks.ts"

export const get = os
  .handler(async () => {
    return await Tasks.list()
  })

export const post = os
  .input(z.object({
    title: z.string(),
    parentId: z.string().optional(),
    description: z.string().optional(),
    status: z.string().optional(),
  }))
  .handler(async ({ input }) => {
    const { title, parentId, description, status } = input
    return await Tasks.create(title, parentId, description, status)
  })
  .route({ method: "POST", path: "/", successStatus: 201 })
