import { describe, it, expect, vi, afterEach } from "vitest"
import { join } from "node:path"
import { mkdtemp, rm, writeFile, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import * as System from "./system.ts"
import * as execaModule from "execa"

vi.mock("execa", () => {
  return {
    execa: vi.fn()
  }
})

function mockPkgManagers(outputs: Record<string, string>) {
  return vi.mocked(execaModule.execa).mockImplementation((cmd, args) => {
    const fullCmd = [cmd, ...(args || [])].join(" ");
    if (outputs[fullCmd]) {
      return Promise.resolve({ stdout: outputs[fullCmd] }) as any;
    }
    return Promise.reject(new Error("Command not found"));
  })
}

describe("System utils", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("getPackageCacheMounts - detects npm", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'test-'))
    const originalCwd = process.cwd()
    mockPkgManagers({
      "npm config get cache": "/mock/npm/cache"
    })

    try {
      process.chdir(tempDir)
      await writeFile("package-lock.json", "{}")

      const mounts = await System.getPackageCacheMounts()
      expect(mounts).toEqual([["/mock/npm/cache", "/root/.npm"]])
    } finally {
      process.chdir(originalCwd)
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it("getPackageCacheMounts - detects multiple", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'test-'))
    const originalCwd = process.cwd()
    mockPkgManagers({
      "npm config get cache": "/mock/npm/cache",
      "yarn cache dir": "/mock/yarn/cache"
    })

    try {
      process.chdir(tempDir)
      await writeFile("package-lock.json", "{}")
      await writeFile("yarn.lock", "")

      const mounts = await System.getPackageCacheMounts()
      expect(mounts).toHaveLength(2)
      expect(mounts).toEqual([
        ["/mock/npm/cache", "/root/.npm"],
        ["/mock/yarn/cache", "/usr/local/share/.cache/yarn"]
      ])
    } finally {
      process.chdir(originalCwd)
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it("getAgentConfigMount - creates dir and returns mount", async () => {
    const tempHome = await mkdtemp(join(tmpdir(), 'test-'))
    const originalHome = process.env.HOME
    
    process.env.HOME = tempHome

    try {
      const mount = await System.getAgentConfigMount()
      const opencodePath = join(tempHome, ".opencode")
      
      const s = await stat(opencodePath)
      expect(s.isDirectory()).toBe(true)
      
      expect(mount).toEqual([`${opencodePath}`, `/root/.opencode:ro`])
    } finally {
      process.env.HOME = originalHome
      await rm(tempHome, { recursive: true, force: true })
    }
  })

  it("getEnvVars - filters vars", () => {
    const originalEnv = { ...process.env }
    process.env.TEST_VAR_A = "valueA"
    process.env.TEST_VAR_B = "valueB"
    
    try {
      const vars = System.getEnvVars(["TEST_VAR_A", "MISSING_VAR"])
      expect(vars).toEqual({ "TEST_VAR_A": "valueA" })
      expect(vars["TEST_VAR_B"]).toBeUndefined()
    } finally {
      process.env = originalEnv
    }
  })
})
