import { z } from "zod";

export function parseZodArgs<T extends z.ZodTypeAny>(schema: T, args: Record<string, any>): z.infer<T> {
  const result = schema.safeParse(args);
  if (!result.success) {
    for (const error of result.error.issues) {
      const path = error.path.join(".");
      console.error(`Error: ${path} - ${error.message}`);
    }
    process.exit(1);
  }
  return result.data as z.infer<T>;
}

// Helper to convert numbers to strings when they are passed as arguments (like `hb logs 123 1`)
export const StringArg = z.union([z.string(), z.number()]).transform(String);