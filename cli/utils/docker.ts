import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { copyFile, mkdir, writeFile, chmod, access } from "node:fs/promises"
import { execa } from "execa"
import { HYPERBRANCH_DIR } from "./paths.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

async function exists(path: string) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function copy(src: string, dest: string, options?: { overwrite?: boolean }) {
  await copyFile(src, dest)
}

const ASSETS_DIR = join(__dirname, "..", "assets")
const fromAssets = (filename: string): string => join(ASSETS_DIR, filename)

const copyAssetWithOverride = (filename: string, destDir: string, overrideSource?: string): Promise<void> =>
  copy(overrideSource ?? fromAssets(filename), join(destDir, filename), { overwrite: true })

export interface DockerConfig {
  image: string
  name?: string
  dockerfile?: string
  exec: string[]
  workdir: string // The path INSIDE the container (mapped to clone)
  hostWorkdir: string // The path ON HOST (the clone)
  runDir: string // The path ON HOST where run files are stored
  mounts: string[]
  env: Record<string, string>
  user: string
  dockerArgs: string[]
}

export async function prepareRunAssets(
  runDir: string,
  sourcePaths?: {
    entrypoint?: string
    dockerfile?: string
    dockerCompose?: string
  }
) {
  // Ensure run directory exists
  await mkdir(runDir, { recursive: true })

  await Promise.all([
    copyAssetWithOverride("docker-compose.yml", runDir, sourcePaths?.dockerCompose),
    copyAssetWithOverride("Dockerfile", runDir, sourcePaths?.dockerfile),
    copyAssetWithOverride("entrypoint.sh", runDir, sourcePaths?.entrypoint),
  ])

  // Make entrypoint executable
  await chmod(join(runDir, "entrypoint.sh"), 0o755)
}

export async function writeEnvComposeFile(
  runDir: string,
  env: Record<string, string>,
) {
  const envContent = Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n")
  await writeFile(join(runDir, ".env.compose"), envContent)
}

export async function scaffoldRunEnvironment(
  runDir: string,
  envVars: Record<string, string> = {},
  options?: {
    dockerfile?: string;
    dockerCompose?: string;
    entrypoint?: string;
  }
) {
  // 1. Prepare static assets
  await prepareRunAssets(runDir, options);

  // 2. Write .env.compose
  const userId = await getUserId();
  const env: Record<string, string> = {
    HB_USER: userId,
    HB_UID: userId.split(":")[0],
    HB_GID: userId.split(":")[1] || userId.split(":")[0],
    ...envVars,
  };
  await writeEnvComposeFile(runDir, env);

  // 3. Copy or create .env
  const envRunPath = join(HYPERBRANCH_DIR, ".env.run");
  const envDestPath = join(runDir, ".env");
  if (await exists(envRunPath)) {
    await copy(envRunPath, envDestPath, { overwrite: true });
  } else {
    await writeFile(envDestPath, "");
  }
}

export async function buildImage(
  dockerfile: string,
  tag: string,
): Promise<void> {
  console.log(`Building Docker image ${tag} from ${dockerfile}...`)
  try {
    await execa("docker", ["build", "-f", dockerfile, "-t", tag, dirname(dockerfile)], {
      stdio: "inherit",
    })
  } catch (error) {
    throw new Error("Docker build failed")
  }
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

export async function getContainerIdByName(name: string): Promise<string | null> {
  try {
    const { stdout } = await dcmd(["inspect", "--format", "{{.Id}}", name])
    return stdout.trim() || null
  } catch {
    return null
  }
}

export async function getContainerStatus(cid: string): Promise<{ status: string; startedAt: string; exitCode: number | null }> {
  try {
    const { stdout } = await dcmd(["inspect", "--format", "{{.State.Status}}|{{.State.StartedAt}}|{{.State.ExitCode}}", cid])
    const text = stdout.trim()
    const [status, startedAt, exitCodeStr] = text.split("|")
    const exitCode = exitCodeStr ? parseInt(exitCodeStr, 10) : null
    return { status, startedAt, exitCode: isNaN(exitCode as number) ? null : exitCode }
  } catch {
    return { status: "unknown", startedAt: "", exitCode: null }
  }
}

export async function removeContainer(cid: string, force = false): Promise<void> {
  const args = ["rm", cid]
  if (force) args.splice(1, 0, "-f")
  try { await dcmd(args) } catch {}
}

export async function containerExists(nameOrId: string): Promise<boolean> {
  try {
    await dcmd(["inspect", "--format", "{{.Id}}", nameOrId])
    return true
  } catch {
    return false
  }
}

export async function findContainersByPartialName(nameFragment: string): Promise<string[]> {
  try {
    const { stdout } = await dcmd(["ps", "-a", "--filter", `name=${nameFragment}`, "--format", "{{.Names}}"])
    return stdout.trim().split("\n").filter(Boolean)
  } catch {
    return []
  }
}

export async function findNetworksByPartialName(nameFragment: string): Promise<string[]> {
  try {
    const { stdout } = await dcmd(["network", "ls", "--filter", `name=${nameFragment}`, "--format", "{{.Name}}"])
    return stdout.trim().split("\n").filter(Boolean)
  } catch {
    return []
  }
}

export async function removeNetwork(name: string): Promise<void> {
  try { await dcmd(["network", "rm", name]) } catch {}
}

export async function removeImage(tag: string, force = false): Promise<void> {
  const args = ["rmi", tag]
  if (force) args.splice(1, 0, "-f")
  try { await dcmd(args) } catch {}
}

// Helpers
export const dockerCmd = (args: string[], opts: { cwd?: string, stdio?: "pipe" | "inherit" | "ignore", env?: Record<string, string> } = {}) => {
  return execa("docker", args, {
    cwd: opts.cwd,
    stdio: opts.stdio || "pipe",
    env: opts.env as any
  })
}

const dcmd = async (args: string[], opts: { cwd?: string, stdio?: "pipe" | "inherit" | "ignore", env?: Record<string, string> } = {}) => {
  const result = await dockerCmd(args, opts)
  return result as typeof result & { stdout: string; stderr: string }
}

export async function getContainerPort(cid: string, internalPort: number): Promise<number | null> {
  try {
    const { stdout } = await dcmd(["port", cid, internalPort.toString()])
    const text = stdout.trim()
    if (!text) return null

    const firstLine = text.split("\n")[0]
    const parts = firstLine.split(":")
    const portStr = parts[parts.length - 1]
    const port = parseInt(portStr, 10)
    return isNaN(port) ? null : port
  } catch {
    return null
  }
}

export async function getContainerLogs(cid: string): Promise<string> {
  try {
    const { stdout, stderr } = await dcmd(["logs", cid], { stdio: "pipe" } as any)
    return stdout + stderr
  } catch (error: any) {
    return (error.stdout || "") + (error.stderr || "")
  }
}

export function stopContainer(cid: string) {
  return dcmd(["stop", cid])
}

export function pauseContainer(cid: string) {
  return dcmd(["pause", cid])
}

export function unpauseContainer(cid: string) {
  return dcmd(["unpause", cid])
}

export async function execContainer(cid: string, cmd: string[], options?: { workdir?: string }): Promise<void> {
  const args = ["exec"]
  if (options?.workdir) {
    args.push("-w", options.workdir)
  }
  args.push(cid, ...cmd)
  
  try {
    await dcmd(args, { stdio: "pipe" })
  } catch (error: any) {
    const stderr = error.stderr || error.message
    throw new Error(`Docker exec failed: ${stderr}`)
  }
}

export class DockerContainerProcess {
  constructor(public cid: string) {}
  
  static fromCid(cid: string) { return new DockerContainerProcess(cid) }
  
  static async fromName(name: string) {
    const cid = await getContainerIdByName(name)
    if (!cid) {
      throw new Error(`No container found with name '${name}'`)
    }
    return new DockerContainerProcess(cid)
  }

  stop() { return stopContainer(this.cid) }
  pause() { return pauseContainer(this.cid) }
  unpause() { return unpauseContainer(this.cid) }
  rm(force: boolean = false) { return removeContainer(this.cid, force) }
  getContainerPort(internalPort: number) { return getContainerPort(this.cid, internalPort) }
  getContainerStatus() { return getContainerStatus(this.cid) }
  getContainerLogs() { return getContainerLogs(this.cid) }
}
