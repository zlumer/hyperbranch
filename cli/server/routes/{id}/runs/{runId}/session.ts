import { os } from "../../../../os.ts";
import { z } from "zod";
import * as Runs from "../../../../../services/runs.ts";
import { ORPCError } from "@orpc/server";
import { parseRouteIds } from "./utils.ts";
import { createOpencodeClient } from "npm:@opencode-ai/sdk";

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
        const client = createOpencodeClient({
          baseUrl: `http://localhost:${port}`,
        });
        const { data: sessions, error } = await client.session.list({});

        if (error) {
          throw new Error(JSON.stringify(error));
        }

        const latestSession = sessions && sessions.length > 0
          ? sessions[0]
          : null;

        return {
          sessionId: latestSession?.id || null,
          port,
        };
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
