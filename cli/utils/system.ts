import { access, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { execa } from "execa"

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

// Helper to run shell command and get stdout
async function runCmd(cmd: string[]): Promise<string> {
  try {
    const { stdout } = await execa(cmd[0], cmd.slice(1))
    return stdout.trim()
  } catch (error: any) {
    throw new Error(`Command failed: ${cmd.join(" ")}`)
  }
}

export function convertMountsToCmd(mounts: [host: string, container: string][]): string[] {
  return mounts.map(([host, container]) => `-v "${host}:${container}"`)
}
export async function getPackageCacheMounts(): Promise<[host: string, container: string][]> {
  const mounts: [string, string][] = []
  const cwd = process.cwd()

  // NPM
  if (await exists(join(cwd, "package-lock.json"))) {
    try {
      const npmCache = await runCmd(["npm", "config", "get", "cache"])
      mounts.push([npmCache, "/root/.npm"])
    } catch {
      // Ignore if npm not found or fails
    }
  }

  // Yarn
  if (await exists(join(cwd, "yarn.lock"))) {
    try {
      const yarnCache = await runCmd(["yarn", "cache", "dir"])
      mounts.push([yarnCache, "/usr/local/share/.cache/yarn"])
    } catch {
      // Ignore
    }
  }

  // PNPM
  if (await exists(join(cwd, "pnpm-lock.yaml"))) {
    try {
      const pnpmStore = await runCmd(["pnpm", "store", "path"])
      mounts.push([pnpmStore, "/root/.local/share/pnpm/store"])
    } catch {
      // Ignore
    }
  }

  return mounts
}

export async function getAgentConfigMount(): Promise<[host: string, container: string]> {
  const home = process.env.HOME
  if (!home) {
    throw new Error("HOME environment variable not set")
  }
  const opencodeDir = join(home, ".opencode")
  if (!(await exists(opencodeDir))) {
    // Ensure it exists on host so mount doesn't fail or create root-owned dir
    await mkdir(opencodeDir, { recursive: true })
  }
  // Read-only mount
  return [opencodeDir, "/root/.opencode:ro"]
}

export function getEnvVars(keys: string[]): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const key of keys) {
    const val = process.env[key]
    if (val !== undefined) {
      vars[key] = val
    }
  }
  return vars
}

export function setupSignalHandler(containerId: string): void {
  const handler = async () => {
    console.log("\nReceived SIGINT. Stopping container...")
    try {
      await execa("docker", ["stop", containerId])
      console.log("Container stopped.")
    } catch (e) {
      console.error(`Error stopping container: ${e}`)
    }
    process.exit(130); // Standard SIGINT exit code
  }
  process.on("SIGINT", handler)
}

export async function getUserId(): Promise<string> {
  if (process.platform === "linux") {
    try {
      const { stdout: uid } = await execa("id", ["-u"])
      const { stdout: gid } = await execa("id", ["-g"])
      return `${uid.trim()}:${gid.trim()}`
    } catch {
      console.warn("Failed to detect UID/GID, defaulting to 'node' user.")
    }
  }
  return "node"
}
