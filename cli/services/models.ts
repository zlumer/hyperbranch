import { TaskId } from "../utils/id.ts";
import * as GitClones from "../utils/git-clones.ts";
import * as Git from "../utils/git.ts";
import * as Docker from "../utils/docker.ts";
import { join } from "node:path";
import { execa } from "execa";
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

async function fetchModelsFromContainer(containerName: string): Promise<string[]> {
  const cid = await Docker.getContainerIdByName(containerName);
  if (!cid) return [];

  const { exitCode, stdout, stderr } = await execa("docker", [
    "exec",
    cid,
    "npx", "-y", "opencode-ai", "models"
  ], { reject: false });
  
  if (exitCode !== 0) {
    throw new Error(`Failed to fetch models from container ${containerName}: ${stderr}`);
  }

  const outputText = stdout;
  
  const models = outputText
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.includes("/")); // basic filter for provider/model format

  return models;
}

async function fetchModels(taskId: TaskId): Promise<string[]> {
  // Fast path: try to fetch from an existing running container first
  try {
    const containerNames = await Docker.findContainersByPartialName("-task-1");
    if (containerNames.length > 0) {
      const models = await fetchModelsFromContainer(containerNames[0]);
      if (models.length > 0) {
        return models;
      }
    }
  } catch (err) {
    console.warn("Fast path fetchModels failed, falling back to temporary clone", err);
  }

  const baseBranch = await Git.resolveBaseBranch(taskId);
  const cloneName = `models-fetch-${Date.now()}`;
  const clonePath = join(HYPERBRANCH_DIR, "clones", cloneName);

  try {
    // 1. Create a temporary clone
    await GitClones.createClone(cloneName, baseBranch, clonePath);

    // 2. Scaffold Environment
    await Docker.scaffoldRunEnvironment(clonePath);

    // 3. Run the models command using docker compose run
    // Using a blank entrypoint to bypass the default opencode server startup
    const composeFile = join(clonePath, "docker-compose.yml");
    
    // Using execa directly instead of Docker utils because we need to capture stdout
    const { exitCode, stdout, stderr } = await execa("docker", [
      "compose",
      "-f", composeFile,
      "run",
      "--rm",
      "--entrypoint", "",
      "task",
      "npx", "-y", "opencode-ai", "models"
    ], { cwd: clonePath, reject: false });
    
    if (exitCode !== 0) {
      throw new Error(`Failed to fetch models: ${stderr}`);
    }

    const outputText = stdout;
    
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
