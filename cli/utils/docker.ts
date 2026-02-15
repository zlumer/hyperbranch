import { dirname, fromFileUrl, join } from "@std/path"
import { ensureDir } from "@std/fs/ensure-dir"
import { copy } from "@std/fs/copy"

export interface DockerConfig {
  image: string
  name?: string
  dockerfile?: string
  exec: string[]
  workdir: string // The path INSIDE the container (mapped to worktree)
  hostWorkdir: string // The path ON HOST (the worktree)
  runDir: string // The path ON HOST where run files are stored
  mounts: string[]
  env: Record<string, string>
  user: string
  dockerArgs: string[]
}

const ASSETS_DIR = join(dirname(fromFileUrl(import.meta.url)), "..", "assets")
const inAssets = (filename: string): string => join(ASSETS_DIR, filename)

const copyAssetWithOverride = (filename: string, destDir: string, overrideSource?: string): Promise<void> =>
  copy(overrideSource ?? inAssets(filename), join(destDir, filename), { overwrite: true })

export async function prepareWorktreeAssets(
  runDir: string,
  sourcePaths?: {
    entrypoint?: string
    dockerfile?: string
    dockerCompose?: string
  }
) {
  // Ensure run directory exists
  await ensureDir(runDir)

  await Promise.all([
    copyAssetWithOverride("docker-compose.yml", runDir, sourcePaths?.dockerCompose),
    copyAssetWithOverride("Dockerfile", runDir, sourcePaths?.dockerfile),
    copyAssetWithOverride("entrypoint.sh", runDir, sourcePaths?.entrypoint),
  ])

  // Make entrypoint executable
  await Deno.chmod(join(runDir, "entrypoint.sh"), 0o755)
}

export async function writeEnvComposeFile(
  runDir: string,
  env: Record<string, string>,
) {
  const envContent = Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n")
  await Deno.writeTextFile(join(runDir, ".env.compose"), envContent)
}

export async function buildImage(
  dockerfile: string,
  tag: string,
): Promise<void> {
  console.log(`Building Docker image ${tag} from ${dockerfile}...`)
  const output = await dcmd(["build", "-f", dockerfile, "-t", tag, dirname(dockerfile)], {
    stdout: "inherit",
    stderr: "inherit",
  })
  
  if (!output.success) {
    throw new Error("Docker build failed")
  }
}

export async function runContainer(config: DockerConfig): Promise<string> {
  const composeFile = join(config.runDir, "docker-compose.yml")
  const project = config.name || `hb-${Date.now()}`
  const serviceName = "task" // defined in docker-compose.yml

  // 1. Prepare Environment Variables
  const imageToUse = config.dockerfile ? await (async () => {
      const tag = `hb-custom-${project}`
      await buildImage(config.dockerfile!, tag)
      return tag
  })() : config.image

  // Generate .env file for the compose run
  const envMap = { ...config.env, HB_IMAGE: imageToUse }
  const envContent = mergeEnvToText(envMap)
  
  await Deno.writeTextFile(join(config.runDir, ".env"), envContent)

  // 2. Construct docker compose run command
  const args = createDockerServiceArgs(project, composeFile, config, serviceName)

  console.log(`Starting container with command: docker ${args.join(" ")}`)

  const output = await dcmd(args, {
    env: Deno.env.toObject(),
    stdout: "piped",
    stderr: "piped",
  })

  if (!output.success) {
    const errorText = new TextDecoder().decode(output.stderr)
    throw new Error(`Failed to start container: ${errorText}`)
  }

  // 3. Get Container ID
  const containerName = config.name || project
  const inspectOutput = await dcmd(["inspect", "--format", "{{.Id}}", containerName], {
      stdout: "piped"
  })
  
  if (!inspectOutput.success) {
     throw new Error(`Container started but failed to inspect ID for ${containerName}`)
  }

  const cid = new TextDecoder().decode(inspectOutput.stdout).trim()
  console.log(`Container started: ${cid}`)

  // 4. Capture Logs
  const stdoutPath = join(config.runDir, "stdout.log")
  const stderrPath = join(config.runDir, "stderr.log")
  await captureLogs(cid, stdoutPath, stderrPath)
  
  return cid
}

async function captureLogs(cid: string, stdoutPath: string, stderrPath: string) {

  const [stdoutFile, stderrFile] = await Promise.all([
    Deno.open(stdoutPath, { write: true, create: true }),
    Deno.open(stderrPath, { write: true, create: true })
  ]);

  const logsCmd = new Deno.Command("docker", {
    args: ["logs", "-f", cid],
    stdout: "piped",
    stderr: "piped",
  });

  const logsProcess = logsCmd.spawn();

  // Pipe streams (don't await, let it run in background)
  logsProcess.stdout.pipeTo(stdoutFile.writable).catch(() => { });
  logsProcess.stderr.pipeTo(stderrFile.writable).catch(() => { });
}

function mergeEnvToText(envMap: Record<string, string>): string {
  return Object.entries(envMap)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}

function createDockerServiceArgs(project: string, composeFile: string, config: DockerConfig, serviceName: string) {
  const overrideEntrypoint = config.exec.length > 0 ? ["--entrypoint", ""] : [];
  const mounts = config.mounts.flatMap(mount => ["-v", mount.replace(/^-v\s+/, "")]);
  return [
    "compose",
    "-p", project,
    "-f", composeFile,
    "run",
    "-d", // Detached mode
    "--name", config.name || project,
    "--workdir", config.workdir,
    "--user", config.user,
    // Mount the main worktree
    "-v", `${config.hostWorkdir}:${config.workdir}`,
    // Mount entrypoint script
    "-v", `${join(config.runDir, "entrypoint.sh")}:/entrypoint.sh:ro`,
    // If a custom command is provided, we must override the entrypoint
    ...overrideEntrypoint,
    // Add extra mounts
    ...mounts,
    serviceName,
    ...config.exec
  ];
}

export async function getContainerIdByName(name: string): Promise<string | null> {
  try {
    const output = await dcmd(["inspect", "--format", "{{.Id}}", name], {
        stdout: "piped",
        stderr: "null",
    })
    if (!output.success) return null
    
    return new TextDecoder().decode(output.stdout).trim()
  } catch {
    return null
  }
}

export async function getContainerStatus(cid: string): Promise<{ status: string; startedAt: string }> {
  try {
    const output = await dcmd(["inspect", "--format", "{{.State.Status}}|{{.State.StartedAt}}", cid], {
        stdout: "piped",
        stderr: "null",
    })
    if (!output.success) return { status: "unknown", startedAt: "" }
    
    const text = new TextDecoder().decode(output.stdout).trim()
    const [status, startedAt] = text.split("|")
    return { status, startedAt }
  } catch {
    return { status: "unknown", startedAt: "" }
  }
}

export async function removeContainer(cid: string, force = false): Promise<void> {
  const args = ["rm", cid]
  if (force) args.splice(1, 0, "-f")
  await dcmd(args, { stdout: "null", stderr: "null" })
}

export async function containerExists(nameOrId: string): Promise<boolean> {
  try {
    const output = await dcmd(["inspect", "--format", "{{.Id}}", nameOrId], { stdout: "null", stderr: "null" })
    return output.success
  } catch {
    return false
  }
}

export async function findContainersByPartialName(nameFragment: string): Promise<string[]> {
  try {
    const output = await dcmd(["ps", "-a", "--filter", `name=${nameFragment}`, "--format", "{{.Names}}"], { stdout: "piped", stderr: "null" })
    if (!output.success) return []
    return new TextDecoder().decode(output.stdout).trim().split("\n").filter(Boolean)
  } catch {
    return []
  }
}

export async function removeImage(tag: string, force = false): Promise<void> {
  const args = ["rmi", tag]
  if (force) args.splice(1, 0, "-f")
  await dcmd(args, { stdout: "null", stderr: "null" })
}

// Helpers

type StdoutError = "piped" | "inherit" | "null" | undefined

const dcmd = (args: string[], opts: { cwd?: string, stdout?: StdoutError, stderr?: StdoutError, env?: Record<string, string> } = {}) => 
    new Deno.Command("docker", {
        args,
        cwd: opts.cwd,
        stdout: opts.stdout,
        stderr: opts.stderr,
        env: opts.env
    }).output()

export async function getContainerPort(cid: string, internalPort: number): Promise<number | null> {
  const output = await dcmd(["port", cid, internalPort.toString()], { stdout: "piped", stderr: "null" })
  if (!output.success) return null

  const text = new TextDecoder().decode(output.stdout).trim()
  if (!text) return null

  // Format: 80/tcp -> 0.0.0.0:32768
  const firstLine = text.split("\n")[0]
  const parts = firstLine.split(":")
  const portStr = parts[parts.length - 1]
  const port = parseInt(portStr, 10)
  return isNaN(port) ? null : port
}

export async function getContainerLogs(cid: string): Promise<string> {
  const output = await dcmd(["logs", cid], { stdout: "piped", stderr: "piped" })
  const stdout = new TextDecoder().decode(output.stdout)
  const stderr = new TextDecoder().decode(output.stderr)
  return stdout + stderr
}

export function stopContainer(cid: string) {
  return dcmd(["stop", cid], { stdout: "null", stderr: "inherit" })
}

export function pauseContainer(cid: string) {
  return dcmd(["pause", cid], { stdout: "null", stderr: "inherit" })
}

export function unpauseContainer(cid: string) {
  return dcmd(["unpause", cid], { stdout: "null", stderr: "inherit" })
}

// Class wrapper for compatibility and convenience
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

  stop() {
    return stopContainer(this.cid)
  }
  
  pause() {
    return pauseContainer(this.cid)
  }
  
  unpause() {
    return unpauseContainer(this.cid)
  }
  
  rm(force: boolean = false) {
    return removeContainer(this.cid, force)
  }
  
  getContainerPort(internalPort: number) {
    return getContainerPort(this.cid, internalPort)
  }
  
  getContainerStatus() {
    return getContainerStatus(this.cid)
  }
  
  getContainerLogs() {
    return getContainerLogs(this.cid)
  }
}
