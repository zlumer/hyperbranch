import { dirname, fromFileUrl, join } from "@std/path";
import { exists } from "@std/fs/exists";
import { copy } from "@std/fs/copy";

export interface DockerConfig {
  image: string;
  dockerfile?: string;
  exec: string[];
  workdir: string; // The path INSIDE the container (mapped to worktree)
  hostWorkdir: string; // The path ON HOST (the worktree)
  mounts: string[];
  env: Record<string, string>;
  user: string;
  dockerArgs: string[];
}

export async function prepareWorktreeAssets(
  worktreePath: string,
  customDockerfile?: string,
): Promise<void> {
  // Locate assets relative to this module
  const assetsDir = join(dirname(fromFileUrl(import.meta.url)), "..", "assets");

  // 1. run.sh
  await copy(join(assetsDir, "run.sh"), join(worktreePath, "run.sh"), {
    overwrite: true,
  });

  // 2. Dockerfile (if not custom)
  if (!customDockerfile) {
    await copy(
      join(assetsDir, "Dockerfile"),
      join(worktreePath, "Dockerfile"),
      { overwrite: true },
    );
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
  logDir: string,
  onStart: (id: string) => void,
): Promise<void> {
  // Prepare log files
  const stdoutPath = join(logDir, "stdout.log");
  const stderrPath = join(logDir, "stderr.log");
  const cidFile = join(config.hostWorkdir, "hb.cid");

  // Construct Environment Variables for run.sh
  const scriptEnv: Record<string, string> = {
    ...config.env, // Pass user envs
    HB_IMAGE: config.image,
    HB_CMD: config.exec.map((c) => `"${c}"`).join(" "), // Naive quoting, simpler for now
    HB_USER: config.user,
    HB_ARGS: [
      ...config.mounts,
      ...config.dockerArgs,
      // Env vars for container are added here
      ...Object.keys(config.env).map((k) => `-e ${k}`),
    ].join(" "),
  };

  // We execute `bash run.sh` in detached mode using nohup
  // This allows the Deno process to exit while the container keeps running
  console.log(`Executing Docker script (run.sh) in background...`);

  // Using sh -c to wrap the nohup command
  // stdout.log and stderr.log are created in the worktree (cwd)
  const cmd = new Deno.Command("sh", {
    args: [
      "-c",
      `nohup ./run.sh > stdout.log 2> stderr.log < /dev/null &`,
    ],
    cwd: config.hostWorkdir,
    env: scriptEnv,
    stdout: "null",
    stderr: "null",
  });

  const process = cmd.spawn();
  await process.status; // Wait for the 'spawn' command (nohup) to finish, which is instant

  // Wait for CID file to be populated by the script
  let cid = "";
  console.log("Waiting for container to start...");
  
  for (let i = 0; i < 100; i++) { // Wait up to 10s
    try {
      cid = await Deno.readTextFile(cidFile);
      if (cid.trim()) break;
    } catch {
      // wait
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  if (cid.trim()) {
    onStart(cid.trim());
  } else {
    throw new Error("Timed out waiting for container to start. Check worktree logs.");
  }
}
