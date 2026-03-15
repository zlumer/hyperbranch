---
id: 6ab-q2f-s1a
status: build
parent: null
dependencies: []
---
# fix task update

I've investigated the cause of the INTERNAL_SERVER_ERROR (500) when performing a PATCH on a task. 
The Root Cause
The error is caused by a TypeError: Cannot stringify undefined in the YAML serialization logic. 
1. The PATCH handler in cli/server/routes/{id}/index.ts receives an input object that includes optional fields like title and description. 
2. Even if these fields are not provided in the request body, some layers of the API stack (oRPC/Zod) may pass them as undefined to the handler.
3. These undefined values are then merged into the task's frontmatter and passed to stringifyYaml in cli/utils/loadTask.ts.
4. Deno's @std/yaml library explicitly throws an error when it encounters an undefined value during stringification.
Additionally, I found that "Task not found" errors are being returned as 500s instead of 404s because they are thrown as plain Error objects, which oRPC catches and converts to INTERNAL_SERVER_ERROR before they reach the global error handler.
Proposed Plan
1. Fix Tasks.update in cli/services/tasks.ts:
   - Modify the update function to filter out any keys with undefined values from the updates before applying them to the task's frontmatter. This ensures that stringifyYaml only receives valid values.
2. Improve Error Mapping in API Handlers:
   - Update cli/server/routes/{id}/index.ts (and other relevant route files) to catch errors from the service layer.
   - If a "not found" error is caught, throw an ORPCError("NOT_FOUND") to ensure the client receives a proper 404 status code instead of a 500.
3. Verification:
   - I will use deno eval to simulate the PATCH request and verify that it now returns 200 OK and correctly updates the task file.
   - I will also verify that requesting a non-existent task returns 404 Not Found.