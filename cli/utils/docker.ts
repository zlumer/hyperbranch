import { dirname, fromFileUrl, join } from "@std/path";
import { ensureDir } from "@std/fs/ensure-dir";
import { copy } from "@std/fs/copy";

export interface DockerConfig {
  image: string;
  name?: string;
  dockerfile?: string;
  exec: string[];
  workdir: string; // The path INSIDE the container (mapped to worktree)
  hostWorkdir: string; // The path ON HOST (the worktree)
  runDir: string; // The path ON HOST where run files are stored
  mounts: string[];
  env: Record<string, string>;
  user: string;
  dockerArgs: string[];
}

const ASSETS_DIR = join(dirname(fromFileUrl(import.meta.url)), "..", "assets")
const inAssets = (filename: string): string => join(ASSETS_DIR, filename);

const copyAssetWithOverride = (filename: string, destDir: string, overrideSource?: string): Promise<void> =>
  copy(overrideSource ?? inAssets(filename), join(destDir, filename), { overwrite: true })

export async function prepareWorktreeAssets(
  runDir: string,
  sourcePaths?: {
    entrypoint?: string,
    dockerfile?: string,
    dockerCompose?: string,
  }
) {
  // Ensure run directory exists
  await ensureDir(runDir);

  await copyAssetWithOverride("docker-compose.yml", runDir, sourcePaths?.dockerCompose)
  await copyAssetWithOverride("Dockerfile", runDir, sourcePaths?.dockerfile)
  await copyAssetWithOverride("entrypoint.sh", runDir, sourcePaths?.entrypoint)

  // Make entrypoint executable
  await Deno.chmod(join(runDir, "entrypoint.sh"), 0o755);
}
export async function writeEnvComposeFile(
  runDir: string,
  env: Record<string, string>,
) {
  const envContent = Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  await Deno.writeTextFile(join(runDir, ".env.compose"), envContent);
}

export async function buildImage(
  dockerfile: string,
  tag: string,
): Promise<void> {
  console.log(`Building Docker image ${tag} from ${dockerfile}...`);
  const cmd = new Deno.Command("docker", {
    args: ["build", "-f", dockerfile, "-t", tag, dirname(dockerfile)],
    stdout: "inherit",
    stderr: "inherit",
  });
  const output = await cmd.output();
  if (!output.success) {
    throw new Error("Docker build failed");
  }
}

export async function runContainer(
  config: DockerConfig,
  onStart: (id: string) => void,
): Promise<void> {
  const composeFile = join(config.runDir, "docker-compose.yml");
  const project = config.name || `hb-${Date.now()}`;
  const serviceName = "task"; // defined in docker-compose.yml

  // 1. Prepare Environment Variables
  // We need to merge config.env with HB_IMAGE and others
  let imageToUse = config.image;

  if (config.dockerfile) {
    // Build the image first
    const tag = `hb-custom-${project}`;
    await buildImage(config.dockerfile, tag);
    imageToUse = tag;
  }

  // Generate .env file for the compose run
  // We put all config.env into .env, plus HB_IMAGE
  const envMap = { ...config.env, HB_IMAGE: imageToUse };
  const envContent = Object.entries(envMap)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  await Deno.writeTextFile(join(config.runDir, ".env"), envContent);

  // 2. Construct docker compose run command
  // docker compose -p <project> -f <file> run -d --name <name> ... service [command]
  
  const args = [
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
  ];

  // If a custom command is provided, we must override the entrypoint
  // because entrypoint.sh ignores arguments.
  if (config.exec.length > 0) {
    args.push("--entrypoint", "");
  }

  // Add extra mounts
  for (const mount of config.mounts) {
    const cleanMount = mount.replace(/^-v\s+/, "");
    args.push("-v", cleanMount);
  }

  // Service name and command
  args.push(serviceName);
  args.push(...config.exec);

  console.log(`Starting container with command: docker ${args.join(" ")}`);

  const cmd = new Deno.Command("docker", {
    args,
    env: Deno.env.toObject(), // Inherit env (PATH etc)
    stdout: "piped",
    stderr: "piped",
  });

  const output = await cmd.output();

  if (!output.success) {
    const errorText = new TextDecoder().decode(output.stderr);
    throw new Error(`Failed to start container: ${errorText}`);
  }

  // 3. Get Container ID
  const containerName = config.name || project;
  
  const inspectCmd = new Deno.Command("docker", {
    args: ["inspect", "--format", "{{.Id}}", containerName],
    stdout: "piped",
  });
  const inspectOutput = await inspectCmd.output();
  
  if (!inspectOutput.success) {
     throw new Error(`Container started but failed to inspect ID for ${containerName}`);
  }

  const cid = new TextDecoder().decode(inspectOutput.stdout).trim();
  console.log(`Container started: ${cid}`);
  
  onStart(cid);

  // 4. Capture Logs
  const stdoutPath = join(config.runDir, "stdout.log");
  const stderrPath = join(config.runDir, "stderr.log");
  
  const stdoutFile = await Deno.open(stdoutPath, { write: true, create: true });
  const stderrFile = await Deno.open(stderrPath, { write: true, create: true });

  const logsCmd = new Deno.Command("docker", {
    args: ["logs", "-f", cid],
    stdout: "piped",
    stderr: "piped",
  });

  const logsProcess = logsCmd.spawn();
  
  // Pipe streams (don't await, let it run in background)
  logsProcess.stdout.pipeTo(stdoutFile.writable).catch(() => {});
  logsProcess.stderr.pipeTo(stderrFile.writable).catch(() => {});
}

export async function getContainerStatus(cid: string): Promise<{ status: string; startedAt: string }> {
  try {
    const cmd = new Deno.Command("docker", {
      args: ["inspect", "--format", "{{.State.Status}}|{{.State.StartedAt}}", cid],
      stdout: "piped",
      stderr: "null",
    });
    const output = await cmd.output();
    if (!output.success) return { status: "unknown", startedAt: "" };
    
    const text = new TextDecoder().decode(output.stdout).trim();
    const [status, startedAt] = text.split("|");
    return { status, startedAt };
  } catch {
    return { status: "unknown", startedAt: "" };
  }
}

export async function removeContainer(cid: string, force = false): Promise<void> {
  const args = ["rm", cid];
  if (force) args.splice(1, 0, "-f");
  const cmd = new Deno.Command("docker", {
    args,
    stdout: "null",
    stderr: "null",
  });
  await cmd.output();
}

export async function containerExists(nameOrId: string): Promise<boolean> {
  try {
    const cmd = new Deno.Command("docker", {
      args: ["inspect", "--format", "{{.Id}}", nameOrId],
      stdout: "null",
      stderr: "null",
    });
    const output = await cmd.output();
    return output.success;
  } catch {
    return false;
  }
}

export async function findContainersByPartialName(nameFragment: string): Promise<string[]> {
  try {
    const cmd = new Deno.Command("docker", {
      args: ["ps", "-a", "--filter", `name=${nameFragment}`, "--format", "{{.Names}}"],
      stdout: "piped",
      stderr: "null",
    });
    const output = await cmd.output();
    if (!output.success) return [];
    return new TextDecoder().decode(output.stdout).trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}


export async function removeImage(tag: string, force = false): Promise<void> {
  const args = ["rmi", tag];
  if (force) args.splice(1, 0, "-f");

  const cmd = new Deno.Command("docker", {
    args,
    stdout: "null",
    stderr: "null",
  });
  await cmd.output();
}
