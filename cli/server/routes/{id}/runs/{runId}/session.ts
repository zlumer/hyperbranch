import { os } from "../../../../os.js";
import { z } from "zod";
import * as Runs from "../../../../../services/runs.js";
import { ORPCError } from "@orpc/server";
import { parseRouteIds } from "./utils.js";
import { getOpencodeService } from "../../../../../services/opencode.js";

export const get = os
  .input(z.object({ id: z.string(), runId: z.string() }))
  .handler(async ({ input }: { input: { id: string; runId: string } }) => {
    const { runId } = parseRouteIds(input.id, input.runId);
    if (!runId) {
      throw new ORPCError("BAD_REQUEST", { message: "Invalid run ID" });
    }
    try {
      const port = await Runs.getHostPort(runId, 4096);

      try {
        const service = getOpencodeService(port);
        const sessionId = await service.getLatestSessionId();
        return { sessionId, port };
      } catch (err: any) {
        // If opencode API fails but port exists, we still return the port
        console.error("Failed to fetch opencode sessions:", err.message);
        return { sessionId: null, port };
      }
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new ORPCError("NOT_FOUND", {
        message: msg || `Run ID '${runId}' does not exist`,
      });
    }
  });
