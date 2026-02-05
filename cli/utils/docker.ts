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

  const stdoutFile = await Deno.open(stdoutPath, {
    write: true,
    create: true,
    truncate: true,
  });
  const stderrFile = await Deno.open(stderrPath, {
    write: true,
    create: true,
    truncate: true,
  });

  const cidFile = join(config.hostWorkdir, "hb.cid");

  try {
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

    // We are executing `bash run.sh` in the worktree
    console.log(`Executing Docker script (run.sh)...`);

    const cmd = new Deno.Command("bash", {
      args: ["run.sh"],
      cwd: config.hostWorkdir,
      env: scriptEnv,
      stdout: "piped",
      stderr: "piped",
    });

    const process = cmd.spawn();

    // Wait briefly for CID file to be populated by the script
    let cid = "";
    for (let i = 0; i < 50; i++) { // Wait up to 5s
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
    }

    // Pipe streams
    // We want: Process -> Console AND Process -> File
    // We can't use .pipeTo() twice on the same ReadableStream. We need to tee() it.

    const [stdoutConsole, stdoutLog] = process.stdout.tee();
    const [stderrConsole, stderrLog] = process.stderr.tee();

    // Pipe to console
    const pipes = [
      stdoutConsole.pipeTo(Deno.stdout.writable, { preventClose: true }),
      stderrConsole.pipeTo(Deno.stderr.writable, { preventClose: true }),
      stdoutLog.pipeTo(stdoutFile.writable),
      stderrLog.pipeTo(stderrFile.writable),
    ];

    const status = await process.status;

    // Ensure streams are fully consumed/written before closing files
    await Promise.all(pipes);

    if (!status.success) {
      throw new Error(`Container exited with code ${status.code}`);
    }
  } finally {
    // Cleanup resources
    try {
      stdoutFile.close();
      stderrFile.close();
    } catch { /* ignore */ }

    // Cid file is in worktree, can remain or be deleted.
    // Spec says "run.sh" handles --rm, but cidfile persists on host.
    try {
      await Deno.remove(cidFile);
    } catch { /* ignore */ }
  }
}
