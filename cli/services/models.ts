import { TaskId } from "../utils/id.ts";
import * as GitClones from "../utils/git-clones.ts";
import * as Git from "../utils/git.ts";
import * as Docker from "../utils/docker.ts";
import { join } from "@std/path";
import { HYPERBRANCH_DIR, TASKS_DIR_NAME } from "../utils/paths.ts";

let cachedModels: string[] | null = null;
let isFetching = false;
let fetchPromise: Promise<string[]> | null = null;

export async function getAvailableModels(taskId: TaskId): Promise<string[]> {
  if (cachedModels) {
    return cachedModels;
  }

  if (isFetching && fetchPromise) {
    return fetchPromise;
  }

  isFetching = true;
  fetchPromise = fetchModels(taskId);

  try {
    const models = await fetchPromise;
    cachedModels = models;
    return models;
  } finally {
    isFetching = false;
    fetchPromise = null;
  }
}

async function fetchModels(taskId: TaskId): Promise<string[]> {
  const baseBranch = await Git.resolveBaseBranch(taskId);
  const cloneName = `models-fetch-${Date.now()}`;
  const clonePath = join(HYPERBRANCH_DIR, "clones", cloneName);

  try {
    // 1. Create a temporary clone
    await GitClones.createClone(cloneName, baseBranch, clonePath);

    // 2. Prepare docker assets
    await Docker.prepareRunAssets(clonePath, {});

    // 3. Write env compose file (to match permissions for volume mount)
    const userId = await Docker.getUserId();
    const env: Record<string, string> = {
      HB_USER: userId,
      HB_UID: userId.split(":")[0],
      HB_GID: userId.split(":")[1] || userId.split(":")[0],
    };
    await Docker.writeEnvComposeFile(clonePath, env);

    // 4. Run the models command using docker compose run
    // Using a blank entrypoint to bypass the default opencode server startup
    const composeFile = join(clonePath, "docker-compose.yml");
    
    // Using Deno.Command directly instead of Docker utils because we need to capture stdout
    const cmd = new Deno.Command("docker", {
      args: [
        "compose",
        "-f", composeFile,
        "run",
        "--rm",
        "--entrypoint", "",
        "task",
        "npx", "-y", "opencode-ai", "models"
      ],
      cwd: clonePath,
      stdout: "piped",
      stderr: "piped",
    });

    const { code, stdout, stderr } = await cmd.output();
    
    if (code !== 0) {
      const errText = new TextDecoder().decode(stderr);
      throw new Error(`Failed to fetch models: ${errText}`);
    }

    const outputText = new TextDecoder().decode(stdout);
    
    // Parse stdout: expect one model per line, e.g., "google/gemini-2.5-flash"
    const models = outputText
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.includes("/")); // basic filter for provider/model format

    if (models.length === 0) {
      throw new Error("No models found or output format unrecognised.");
    }

    return models;
  } finally {
    // 5. Cleanup
    await GitClones.removeClone(clonePath, cloneName, true);
  }
}
