import { dirname, fromFileUrl, join } from "@std/path";
import { ensureDir } from "@std/fs/ensure-dir";
import { exists } from "@std/fs/exists";

export interface DockerConfig {
  image: string;
  name?: string;
  exec: string[];
  workdir: string; // The path INSIDE the container (mapped to worktree)
  hostWorkdir: string; // The path ON HOST (the worktree)
  runDir: string; // The path ON HOST where run files are stored
  mounts: string[];
  env: Record<string, string>;
  user: string;
}

export async function prepareWorktreeAssets(
  worktreePath: string,
  runDir: string,
): Promise<void> {
  // Ensure run directory exists
  await ensureDir(runDir);
}

export async function runContainer(
  config: DockerConfig,
  onStart: (id: string) => void,
): Promise<void> {
  // 1. Prepare Environment Variables
  const envContent = Object.entries(config.env)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  await Deno.writeTextFile(join(config.runDir, ".env"), envContent);

  // 2. Determine Docker Compose File
  let composeFile = join(config.hostWorkdir, "docker-compose.yml");
  const hasRepoCompose = await exists(composeFile);
  const serviceName = "task"; // Default service name

  if (!hasRepoCompose) {
    // Generate default docker-compose.yml in runDir
    const volumes = [
      `${config.hostWorkdir}:${config.workdir}`,
      ...config.mounts.map((m) => m.replace(/^-v\s+/, "")),
    ];

    const composeContent = `version: "3.8"
services:
  ${serviceName}:
    container_name: ${config.name || "hb-task"}
    image: ${config.image}
    volumes:
${volumes.map((v) => `      - "${v}"`).join("\n")}
    env_file:
      - .env
    user: "${config.user}"
    working_dir: ${config.workdir}
    network_mode: bridge
`;

    composeFile = join(config.runDir, "docker-compose.yml");
    await Deno.writeTextFile(composeFile, composeContent);
  }

  // 3. Construct command
  const composeArgs = [
    "compose",
    "-f",
    composeFile,
    "run",
    "-d",
    "--name",
    config.name!,
    serviceName,
    ...config.exec,
  ];

  console.log(`Starting container with command: docker ${composeArgs.join(" ")}`);

  const cmd = new Deno.Command("docker", {
    args: composeArgs,
    stdout: "null",
    stderr: "piped",
    // We don't pass env here because we use env_file in compose, 
    // and if using repo compose, we expect it to use .env or be self-contained.
    // However, docker compose might interpolate vars from shell env.
    // Let's pass config.env just in case.
    env: config.env,
  });

  const output = await cmd.output();
  if (!output.success) {
    const error = new TextDecoder().decode(output.stderr);
    throw new Error(`Failed to start container: ${error}`);
  }

  // 4. Get container ID
  const inspectCmd = new Deno.Command("docker", {
    args: ["inspect", "--format", "{{.Id}}", config.name!],
    stdout: "piped",
  });
  const inspectOutput = await inspectCmd.output();
  const cid = new TextDecoder().decode(inspectOutput.stdout).trim();

  if (!cid) {
    throw new Error("Failed to get container ID");
  }

  // 5. Write CID file
  const cidFile = join(config.runDir, "hb.cid");
  await Deno.writeTextFile(cidFile, cid);

  onStart(cid);
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
  // docker ps -a --filter name=nameFragment --format "{{.Names}}"
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
