import { describe, it, expect, vi, afterEach } from "vitest";
import { isRunningService } from "./docker-compose.js";
import * as execaModule from "execa";

vi.mock("execa", () => {
  return {
    execa: vi.fn()
  }
})

describe("isRunningService", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("normal case", async () => {
    const execaMock = vi.mocked(execaModule.execa).mockResolvedValue({
      stdout: "container-id\n"
    } as any);

    const result = await isRunningService("/tmp", "compose.yml", "web");
    expect(result).toBe(true);
    
    expect(execaMock).toHaveBeenCalled();
    const args = execaMock.mock.calls[0][1] as string[];
    expect(args.includes("--status")).toBe(true);
    expect(args.includes("running")).toBe(true);
  });

  it("fallback case", async () => {
    let callCount = 0;
    const execaMock = vi.mocked(execaModule.execa).mockImplementation((...args) => {
      callCount++;
      if (callCount === 1) {
        const err: any = new Error("not found");
        err.code = "ENOENT";
        return Promise.reject(err) as any;
      }
      return Promise.resolve({ stdout: "fallback-id\n" }) as any;
    });

    const result = await isRunningService("/non-existent", "compose.yml", "web", "my-project");
    expect(result).toBe(true);
    
    const fallbackCall = execaMock.mock.calls[1];
    const args = fallbackCall[1] as string[];
    
    expect(fallbackCall[0]).toBe("docker");
    expect(args[0]).toBe("compose");
    expect(args.includes("-p")).toBe(true);
    expect(args[args.indexOf("-p") + 1]).toBe("my-project");
    expect(args.includes("--status")).toBe(true);
    expect(args.includes("running")).toBe(true);
  });
});
