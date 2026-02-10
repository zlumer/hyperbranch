import { assertRejects } from "@std/assert";
import { detectDependencyCycle, detectParentCycle } from "./cycles.ts";
import { join } from "@std/path";

// Setup
const tempDir = await Deno.makeTempDir({ prefix: "hb-cycles-test-" });
Deno.env.set("HB_TASKS_DIR", tempDir);

// Helpers
async function createTask(id: string, parent: string | null = null, dependencies: string[] = []) {
  const content = `---
id: "${id}"
status: todo
parent: ${parent ? `${parent}` : "null"}
dependencies: [${dependencies.map(d => `"${d}"`).join(", ")}]
---
Body of ${id}`;
  await Deno.writeTextFile(join(tempDir, `task-${id}.md`), content);
}

Deno.test("cycles - simple dependency cycle (A->B, adding B->A)", async () => {
  await createTask("A", null, ["B"]);
  await createTask("B", null, []); // B currently clean
  
  // Try to make B depend on A
  await assertRejects(
    async () => await detectDependencyCycle("B", "A"),
    Error,
    "Circular dependency detected"
  );
});

Deno.test("cycles - simple parent cycle (B is parent of A, adding A depends on B)", async () => {
  // B is parent of A. (So B waits for A).
  // We try to make A depend on B => A waits for B.
  // Cycle: A -> B -> A.
  await createTask("A", "B", []);
  await createTask("B", null, []);
  
  await assertRejects(
    async () => await detectDependencyCycle("A", "B"),
    Error,
    "Circular dependency detected"
  );
});

Deno.test("cycles - transitive dependency cycle (A->B->C, adding C->A)", async () => {
  await createTask("A", null, ["B"]);
  await createTask("B", null, ["C"]);
  await createTask("C", null, []);

  await assertRejects(
    async () => await detectDependencyCycle("C", "A"),
    Error,
    "Circular dependency detected"
  );
});

Deno.test("cycles - parent chain cycle (A child of B, B child of C, adding A depends on C)", async () => {
  // A child of B => B -> A
  // B child of C => C -> B
  // Proposed: A depends on C => A -> C
  // Cycle: C -> B -> A -> C
  
  await createTask("A", "B", []);
  await createTask("B", "C", []);
  await createTask("C", null, []);

  await assertRejects(
    async () => await detectDependencyCycle("A", "C"),
    Error,
    "Circular dependency detected"
  );
});

Deno.test("cycles - parent cycle detection (A->B, adding B is child of A)", async () => {
  // A depends on B => A -> B
  // Proposed: B child of A => A -> B (wait, parent waits for child).
  // So A -> B.
  // This is just a double dependency. A waits for B (dep) and A waits for B (parent).
  // NO CYCLE.
  
  await createTask("A", null, ["B"]);
  await createTask("B", null, []);

  // detectParentCycle(Child=B, Parent=A) checks if A depends on B.
  // Source=A, Target=B.
  // Ancestors of A: A.
  // Dependencies of B: [].
  // No match.
  // Should NOT throw.
  
  await detectParentCycle("B", "A");
});

Deno.test("cycles - reverse parent cycle (A->B, adding A is child of B)", async () => {
  // A depends on B => A -> B.
  // Proposed: A child of B => B -> A.
  // Cycle: A -> B -> A.
  
  await createTask("A", null, ["B"]);
  await createTask("B", null, []);

  // detectParentCycle(Child=A, Parent=B)
  await assertRejects(
    async () => await detectParentCycle("A", "B"),
    Error,
    "Circular parentage detected"
  );
});

// Cleanup
Deno.test({
  name: "cleanup",
  fn: async () => {
    await Deno.remove(tempDir, { recursive: true });
    Deno.env.delete("HB_TASKS_DIR");
  },
  sanitizeResources: false,
  sanitizeOps: false
});
