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

export async function prepareWorktreeAssets(
  worktreePath: string,
  runDir: string,
  customDockerfile?: string,
): Promise<void> {
  // Ensure run directory exists
  await ensureDir(runDir);

  // Locate assets relative to this module
  const assetsDir = join(dirname(fromFileUrl(import.meta.url)), "..", "assets");

  // 1. run.sh
  const runScriptPath = join(runDir, "run.sh");
  await copy(join(assetsDir, "run.sh"), runScriptPath, {
    overwrite: true,
  });
  await Deno.chmod(runScriptPath, 0o755);

  // 2. Dockerfile (if not custom)
  if (!customDockerfile) {
    await copy(
      join(assetsDir, "Dockerfile"),
      join(runDir, "Dockerfile"),
      { overwrite: true },
    );
  } else {
    // If custom, copy it to runDir too for consistency? Or just use it?
    // Let's copy it to runDir so we have a record
    await copy(customDockerfile, join(runDir, "Dockerfile"), { overwrite: true });
  }
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
  // Prepare log files
  const stdoutPath = join(config.runDir, "stdout.log");
  const stderrPath = join(config.runDir, "stderr.log");
  const cidFile = join(config.runDir, "hb.cid");

  // Generate .env file
  const envContent = Object.entries(config.env)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  await Deno.writeTextFile(join(config.runDir, ".env"), envContent);

  // Generate docker-compose.yml
  const volumes = [
    `${config.hostWorkdir}:${config.workdir}`,
    ...config.mounts.map((m) => m.replace(/^-v\s+/, "")),
  ];

  const composeContent = `version: "3.8"
services:
  task:
    container_name: ${config.name || "hb-task"}
    ${
      config.dockerfile
        ? `build:
      context: .
      dockerfile: Dockerfile`
        : `image: ${config.image}`
    }
    volumes:
${volumes.map((v) => `      - "${v}"`).join("\n")}
    env_file:
      - .env
    user: "${config.user}"
    working_dir: ${config.workdir}
    network_mode: bridge
`;

  await Deno.writeTextFile(
    join(config.runDir, "docker-compose.yml"),
    composeContent,
  );

  // Construct Environment Variables for run.sh
  const scriptEnv: Record<string, string> = {
    HB_PROJECT_NAME: config.name || `hb-${Date.now()}`,
    HB_CONTAINER_NAME: config.name || "",
    HB_RUN_DIR: config.runDir,
    HB_CID_FILE: cidFile,
  };

  // Execute run.sh
  console.log(`Executing Docker script (run.sh) in background...`);
  const runScript = join(config.runDir, "run.sh");
  const escapedArgs = config.exec
    .map((arg) => `'${arg.replace(/'/g, "'\\''")}'`)
    .join(" ");

  const cmd = new Deno.Command("sh", {
    args: [
      "-c",
      `nohup "${runScript}" ${escapedArgs} > "${stdoutPath}" 2> "${stderrPath}" < /dev/null &`,
    ],
    cwd: config.hostWorkdir,
    env: scriptEnv,
    stdout: "null",
    stderr: "null",
  });

  const process = cmd.spawn();
  await process.status;

  // Wait for CID file to be populated by the script
  let cid = "";
  console.log("Waiting for container to start...");

  for (let i = 0; i < 600; i++) {
    // Wait up to 300s (5m) for image pull etc
    try {
      cid = await Deno.readTextFile(cidFile);
      if (cid.trim()) break;
    } catch {
      // wait
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  if (cid.trim()) {
    onStart(cid.trim());
  } else {
    throw new Error(
      "Timed out waiting for container to start. Check worktree logs.",
    );
  }
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
