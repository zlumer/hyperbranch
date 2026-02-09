import { exists } from "@std/fs/exists";
import { join } from "@std/path";

// Helper to run shell command and get stdout
async function runCmd(cmd: string[]): Promise<string> {
  const command = new Deno.Command(cmd[0], {
    args: cmd.slice(1),
    stdout: "piped",
    stderr: "piped",
  });
  const output = await command.output();
  if (!output.success) {
    throw new Error(`Command failed: ${cmd.join(" ")}`);
  }
  return new TextDecoder().decode(output.stdout).trim();
}

export async function getPackageCacheMounts(): Promise<string[]> {
  const mounts: string[] = [];
  const cwd = Deno.cwd();

  // NPM
  if (await exists(join(cwd, "package-lock.json"))) {
    try {
      const npmCache = await runCmd(["npm", "config", "get", "cache"]);
      mounts.push(`-v "${npmCache}:/root/.npm"`);
    } catch {
      // Ignore if npm not found or fails
    }
  }

  // Yarn
  if (await exists(join(cwd, "yarn.lock"))) {
    try {
      const yarnCache = await runCmd(["yarn", "cache", "dir"]);
      mounts.push(`-v "${yarnCache}:/usr/local/share/.cache/yarn"`);
    } catch {
      // Ignore
    }
  }

  // PNPM
  if (await exists(join(cwd, "pnpm-lock.yaml"))) {
    try {
      const pnpmStore = await runCmd(["pnpm", "store", "path"]);
      mounts.push(`-v "${pnpmStore}:/root/.local/share/pnpm/store"`);
    } catch {
      // Ignore
    }
  }

  return mounts;
}

export async function getAgentConfigMount(): Promise<string> {
  const home = Deno.env.get("HOME");
  if (!home) {
    throw new Error("HOME environment variable not set");
  }
  const opencodeDir = join(home, ".opencode");
  if (!(await exists(opencodeDir))) {
    // Ensure it exists on host so mount doesn't fail or create root-owned dir
    await Deno.mkdir(opencodeDir, { recursive: true });
  }
  // Read-only mount
  return `-v "${opencodeDir}:/root/.opencode:ro"`;
}

export function getEnvVars(keys: string[]): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const key of keys) {
    const val = Deno.env.get(key);
    if (val !== undefined) {
      vars[key] = val;
    }
  }
  return vars;
}

export function setupSignalHandler(containerId: string): void {
  // Deno.addSignalListener is the API for SIGINT
  const handler = async () => {
    console.log("\nReceived SIGINT. Stopping container...");
    try {
      const cmd = new Deno.Command("docker", {
        args: ["stop", containerId],
        stdout: "null",
        stderr: "null",
      });
      await cmd.output();
      console.log("Container stopped.");
    } catch (e) {
      console.error(`Error stopping container: ${e}`);
    }
    Deno.exit(130); // Standard SIGINT exit code
  };
  Deno.addSignalListener("SIGINT", handler);
}
