import { os } from "../../os.ts";
import { z } from "zod";
import * as Models from "../../../services/models.ts";
import { TaskId } from "../../../utils/id.ts";
import { ORPCError } from "@orpc/server";

export const get = os
  .input(
    z.object({
      id: z.string(),
    })
  )
  .handler(async ({ input }) => {
    const taskId = TaskId.from(input.id);
    if (!taskId) throw new ORPCError("BAD_REQUEST", { message: "Invalid task ID" });

    try {
      const models = await Models.getAvailableModels(taskId);
      return { models };
    } catch (error) {
      if (error instanceof Error) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", { message: error.message });
      }
      throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Failed to fetch models" });
    }
  });