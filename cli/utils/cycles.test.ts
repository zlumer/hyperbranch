import { expect, describe, it, beforeEach } from "vitest";
import { detectDependencyCycle, detectParentCycle } from "./cycles.js";
import { TaskFile } from "../types.js";

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

describe("cycles", () => {
  beforeEach(() => {
    clearStore();
  });

  it("simple dependency cycle (A->B, adding B->A)", async () => {
    createTask("A", null, ["B"]);
    createTask("B", null, []); // B currently clean
    
    await expect(detectDependencyCycle("B", "A", mockLoadTask))
      .rejects.toThrow("Circular dependency detected");
  });

  it("simple parent cycle (B is parent of A, adding A depends on B)", async () => {
    createTask("A", "B", []);
    createTask("B", null, []);
    
    await expect(detectDependencyCycle("A", "B", mockLoadTask))
      .rejects.toThrow("Circular dependency detected");
  });

  it("transitive dependency cycle (A->B->C, adding C->A)", async () => {
    createTask("A", null, ["B"]);
    createTask("B", null, ["C"]);
    createTask("C", null, []);

    await expect(detectDependencyCycle("C", "A", mockLoadTask))
      .rejects.toThrow("Circular dependency detected");
  });

  it("parent chain cycle (A child of B, B child of C, adding A depends on C)", async () => {
    createTask("A", "B", []);
    createTask("B", "C", []);
    createTask("C", null, []);

    await expect(detectDependencyCycle("A", "C", mockLoadTask))
      .rejects.toThrow("Circular dependency detected");
  });

  it("parent cycle detection (A->B, adding B is child of A)", async () => {
    createTask("A", null, ["B"]);
    createTask("B", null, []);

    await detectParentCycle("B", "A", mockLoadTask);
  });

  it("reverse parent cycle (A->B, adding A is child of B)", async () => {
    createTask("A", null, ["B"]);
    createTask("B", null, []);

    await expect(detectParentCycle("A", "B", mockLoadTask))
      .rejects.toThrow("Circular parentage detected");
  });
});