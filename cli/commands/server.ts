
import { Args } from "@std/cli/parse-args";
import app, { ensureApiKey } from "../server/main.ts";
import { z } from "zod";
import { parseZodArgs } from "../utils/zod.ts";

const ServerArgsSchema = z.object({
  port: z.union([z.string(), z.number()]).optional(),
  p: z.union([z.string(), z.number()]).optional(),
})

export function serverCommand(rawArgs: Args) {
  const args = parseZodArgs(ServerArgsSchema, rawArgs);
  const portArg = args.port || args.p || Deno.env.get("PORT") || "8000";
  const port = parseInt(String(portArg), 10);

  if (isNaN(port)) {
    console.error(`Invalid port: ${portArg}`);
    Deno.exit(1);
  }

  ensureApiKey();
  console.log(`Server starting on http://localhost:${port}`);
  Deno.serve({ port }, app.fetch);
}
