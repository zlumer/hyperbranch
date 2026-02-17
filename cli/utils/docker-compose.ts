import { parse, stringify } from '@std/yaml'
import { dockerCmd } from "./docker.ts"
import { DockerComposeSchema } from "./docker-compose.schema.ts"

export const DEFAULT_SERVICE_NAME = "hyperbranch-run"

export type Mounts = [host: string, container: string][]
export type Ports = [host: number, container: number][]

export function addDockerCacheMounts(compose: string, mounts: Mounts, serviceName = DEFAULT_SERVICE_NAME): string {
  // parse compose yaml
  // if it has a build context, add mounts for common package manager caches to speed up builds
  // if it has a run context, add mounts for common package manager caches to speed up runs
  // return modified compose yaml

  const parsed = DockerComposeSchema.parse(parse(compose))
  const service = parsed.services?.[serviceName]
  if (!service)
    throw new Error(`Service '${serviceName}' not found in compose file`)

  if (service.build) {
    service.volumes = service.volumes || []
    for (const [host, container] of mounts) {
		// TODO: check for duplicates before adding
      service.volumes.push({ type: "bind", source: host, target: container })
    }
  }
  return stringify(parsed)
}

function composeCmd(args: string[], workdir: string, composeFile: string, projectName?: string) {
  const cmdArgs = ["compose", "-f", composeFile];
  if (projectName) {
    cmdArgs.push("-p", projectName);
  }
  cmdArgs.push(...args);
  
  return dockerCmd(cmdArgs, {
    cwd: workdir,
  });
}

export function up(workdir: string, composeFilePath: string, projectName?: string) {
  return composeCmd(["up", "-d"], workdir, composeFilePath, projectName).output();
}

export function down(workdir: string, composeFilePath: string, projectName?: string) {
  return composeCmd(["down", "-v"], workdir, composeFilePath, projectName).output();
}

export function stop(workdir: string, composeFilePath: string, projectName?: string) {
  return composeCmd(["stop"], workdir, composeFilePath, projectName).output();
}

export function status(workdir: string, composeFilePath: string, projectName?: string) {
  return composeCmd(["ps"], workdir, composeFilePath, projectName).output();
}

export function logs(workdir: string, composeFilePath: string, projectName?: string, follow: boolean = false) {
  const args = ["logs"];
  if (follow) args.push("-f");
  
  const cmd = composeCmd(args, workdir, composeFilePath, projectName);
  return cmd.spawn();
}

export async function isServiceRunningInProject(projectName: string, serviceName: string): Promise<boolean> {
  const cmd = dockerCmd([
    "compose",
    "-p", projectName,
    "ps",
    "-q",
    "--status", "running",
    serviceName
  ], {
    stdout: "piped",
    stderr: "piped"
  });
  const output = await cmd.output();
  const containerId = new TextDecoder().decode(output.stdout).trim();
  return containerId.length > 0;
}

export async function isRunningService(workdir: string, composeFilePath: string, serviceName = DEFAULT_SERVICE_NAME, projectName?: string): Promise<boolean> {
  const cmd = composeCmd(["ps", "-q", "--status", "running", serviceName], workdir, composeFilePath, projectName);
  try {
    const output = await cmd.output();
    const containerId = new TextDecoder().decode(output.stdout).trim();
    return containerId.length > 0;
  } catch (e) {
    // If working directory is missing, it's definitely not running there via compose
    // But if we have a project name, we can check if there are containers for it
    if (e instanceof Deno.errors.NotFound) {
      if (projectName) {
        return isServiceRunningInProject(projectName, serviceName);
      }
      return false;
    }
    throw e;
  }
}

export async function isRunningAny(workdir: string, composeFilePath: string, projectName?: string): Promise<boolean> {
  const cmd = composeCmd(["ps", "-q"], workdir, composeFilePath, projectName);
  try {
    const output = await cmd.output();
    const containerIds = new TextDecoder().decode(output.stdout).trim().split("\n").filter(line => line.length > 0);
    return containerIds.length > 0;
  } catch (e) {
    // If working directory is missing, it's definitely not running there
    if (e instanceof Deno.errors.NotFound) {
      return false;
    }
    throw e;
  }
}

export async function getServicePort(workdir: string, composeFilePath: string, serviceName: string, containerPort: number, projectName?: string): Promise<number> {
  const cmd = composeCmd(["port", serviceName, String(containerPort)], workdir, composeFilePath, projectName);
  const output = await cmd.output();
  return parseInt(new TextDecoder().decode(output.stdout).trim(), 10);
}

export async function getServiceContainerId(
  workdir: string,
  composeFilePath: string,
  serviceName: string,
  projectName?: string
): Promise<string | null> {
  const cmd = composeCmd(["ps", "-q", "-a", serviceName], workdir, composeFilePath, projectName);
  try {
    const output = await cmd.output();
    const id = new TextDecoder().decode(output.stdout).trim();
    return id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

export async function getServiceHostPort(
  workdir: string, 
  composeFilePath: string, 
  serviceName: string, 
  containerPort: number,
  projectName?: string
): Promise<number> {
  // "docker compose port" returns 0.0.0.0:32768
  const cmd = composeCmd(["port", serviceName, String(containerPort)], workdir, composeFilePath, projectName);
  const output = await cmd.output();
  const text = new TextDecoder().decode(output.stdout).trim();
  
  if (!text) throw new Error("Service port not found");
  
  // Format: 0.0.0.0:32768
  const parts = text.split(":");
  const portStr = parts[parts.length - 1];
  const port = parseInt(portStr, 10);
  
  if (isNaN(port)) throw new Error(`Invalid port format: ${text}`);
  
  return port;
}
