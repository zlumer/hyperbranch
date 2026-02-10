import { assertRejects } from "@std/assert";
import { detectDependencyCycle, detectParentCycle } from "./cycles.ts";
import { TaskFile } from "../types.ts";

// --- Mock Setup ---
const mockStore = new Map<string, TaskFile>();

async function mockLoadTask(id: string): Promise<TaskFile> {
  const task = mockStore.get(id);
  if (!task) {
    throw new Error(`Task ${id} not found`);
  }
  return task;
}

function createTask(id: string, parent: string | null = null, dependencies: string[] = []) {
  mockStore.set(id, {
    id,
    path: `/mock/path/task-${id}.md`,
    frontmatter: {
      id,
      status: "todo",
      parent,
      dependencies,
    },
    body: `Body of ${id}`,
  });
}

function clearStore() {
  mockStore.clear();
}

// --- Tests ---

Deno.test({
  name: "cycles - simple dependency cycle (A->B, adding B->A)",
  fn: async () => {
    clearStore();
    createTask("A", null, ["B"]);
    createTask("B", null, []); // B currently clean
    
    // Try to make B depend on A
    await assertRejects(
      async () => await detectDependencyCycle("B", "A", mockLoadTask),
      Error,
      "Circular dependency detected"
    );
  }
});

Deno.test({
  name: "cycles - simple parent cycle (B is parent of A, adding A depends on B)", 
  fn: async () => {
    clearStore();
    // B is parent of A. (So B waits for A).
    // We try to make A depend on B => A waits for B.
    // Cycle: A -> B -> A.
    createTask("A", "B", []);
    createTask("B", null, []);
    
    await assertRejects(
      async () => await detectDependencyCycle("A", "B", mockLoadTask),
      Error,
      "Circular dependency detected"
    );
  }
});

Deno.test({
  name: "cycles - transitive dependency cycle (A->B->C, adding C->A)", 
  fn: async () => {
    clearStore();
    createTask("A", null, ["B"]);
    createTask("B", null, ["C"]);
    createTask("C", null, []);

    await assertRejects(
      async () => await detectDependencyCycle("C", "A", mockLoadTask),
      Error,
      "Circular dependency detected"
    );
  }
});

Deno.test({
  name: "cycles - parent chain cycle (A child of B, B child of C, adding A depends on C)", 
  fn: async () => {
    clearStore();
    // A child of B => B -> A
    // B child of C => C -> B
    // Proposed: A depends on C => A -> C
    // Cycle: C -> B -> A -> C
    
    createTask("A", "B", []);
    createTask("B", "C", []);
    createTask("C", null, []);

    await assertRejects(
      async () => await detectDependencyCycle("A", "C", mockLoadTask),
      Error,
      "Circular dependency detected"
    );
  }
});

Deno.test({
  name: "cycles - parent cycle detection (A->B, adding B is child of A)", 
  fn: async () => {
    clearStore();
    // A depends on B => A -> B
    // Proposed: B child of A => A -> B (wait, parent waits for child).
    // So A -> B.
    // This is just a double dependency. A waits for B (dep) and A waits for B (parent).
    // NO CYCLE.
    
    createTask("A", null, ["B"]);
    createTask("B", null, []);

    // detectParentCycle(Child=B, Parent=A) checks if A depends on B.
    // Source=A, Target=B.
    // Ancestors of A: A.
    // Dependencies of B: [].
    // No match.
    // Should NOT throw.
    
    await detectParentCycle("B", "A", mockLoadTask);
  }
});

Deno.test({
  name: "cycles - reverse parent cycle (A->B, adding A is child of B)", 
  fn: async () => {
    clearStore();
    // A depends on B => A -> B.
    // Proposed: A child of B => B -> A.
    // Cycle: A -> B -> A.
    
    createTask("A", null, ["B"]);
    createTask("B", null, []);

    // detectParentCycle(Child=A, Parent=B)
    await assertRejects(
      async () => await detectParentCycle("A", "B", mockLoadTask),
      Error,
      "Circular parentage detected"
    );
  }
});
