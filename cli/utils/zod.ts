import { z } from "zod";
import { Args } from "@std/cli/parse-args";

export function parseZodArgs<T extends z.ZodTypeAny>(schema: T, args: Args): z.infer<T> {
  const result = schema.safeParse(args);
  if (!result.success) {
    for (const error of result.error.issues) {
      const path = error.path.join(".");
      console.error(`Error: ${path} - ${error.message}`);
    }
    Deno.exit(1);
  }
  return result.data as z.infer<T>;
}

// Helper to convert numbers to strings when they are passed as arguments (like `hb logs 123 1`)
export const StringArg = z.union([z.string(), z.number()]).transform(String);
