import app, { ensureApiKey } from "../server/main.ts";
import { command, string, option } from "cmd-ts";
import { serve } from "@hono/node-server";

export const serverCmd = command({
  name: "server",
  description: "Start the server",
  args: {
    portOpt: option({ type: string, long: "port", short: "p", defaultValue: () => "" }),
  },
  handler: async ({ portOpt }) => {
    const portArg = portOpt || process.env.PORT || "8000";
    const port = parseInt(String(portArg), 10);

    if (isNaN(port)) {
      console.error(`Invalid port: ${portArg}`);
      process.exit(1);
    }

    ensureApiKey();
    console.log(`Server starting on http://localhost:${port}`);
    serve({ fetch: app.fetch, port });
  }
});
