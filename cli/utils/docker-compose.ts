import { parse, stringify } from 'yaml'
import { dockerCmd } from "./docker.js"
import { DockerComposeSchema } from "./docker-compose.schema.js"

export const DEFAULT_SERVICE_NAME = "hyperbranch-run"

export type Mounts = [host: string, container: string][]
export type Ports = [host: number, container: number][]

export function addDockerCacheMounts(compose: string, mounts: Mounts, serviceName = DEFAULT_SERVICE_NAME): string {
  const parsed = DockerComposeSchema.parse(parse(compose))
  const service = parsed.services?.[serviceName]
  if (!service)
    throw new Error(`Service '${serviceName}' not found in compose file`)

  if (service.build) {
    service.volumes = service.volumes || []
    for (const [host, container] of mounts) {
      service.volumes.push({ type: "bind", source: host, target: container })
    }
  }
  return stringify(parsed)
}

function composeCmd(args: string[], workdir: string, composeFile: string, projectName?: string, options: any = {}) {
  const cmdArgs = ["compose", "-f", composeFile];
  if (projectName) {
    cmdArgs.push("-p", projectName);
  }
  cmdArgs.push(...args);
  
  return dockerCmd(cmdArgs, {
    cwd: workdir,
    ...options
  });
}

export function up(workdir: string, composeFilePath: string, projectName?: string) {
  return composeCmd(["up", "-d"], workdir, composeFilePath, projectName);
}

export function down(workdir: string, composeFilePath: string, projectName?: string) {
  return composeCmd(["down", "-v"], workdir, composeFilePath, projectName);
}

export function stop(workdir: string, composeFilePath: string, projectName?: string) {
  return composeCmd(["stop"], workdir, composeFilePath, projectName);
}

export function status(workdir: string, composeFilePath: string, projectName?: string) {
  return composeCmd(["ps"], workdir, composeFilePath, projectName);
}

export function logs(workdir: string, composeFilePath: string, projectName?: string, follow: boolean = false) {
  const args = ["logs"];
  if (follow) args.push("-f");
  
  // To mimic spawning with inherited stdout for logs streaming
  return composeCmd(args, workdir, composeFilePath, projectName, { stdio: "inherit" });
}

export async function isServiceRunningInProject(projectName: string, serviceName: string): Promise<boolean> {
  try {
    const { stdout } = await dockerCmd([
      "compose",
      "-p", projectName,
      "ps",
      "-q",
      "--status", "running",
      serviceName
    ]);
    const containerId = stdout!.trim();
    return containerId.length > 0;
  } catch {
    return false;
  }
}

export async function isRunningService(workdir: string, composeFilePath: string, serviceName = DEFAULT_SERVICE_NAME, projectName?: string): Promise<boolean> {
  try {
    const { stdout } = await composeCmd(["ps", "-q", "--status", "running", serviceName], workdir, composeFilePath, projectName);
    const containerId = stdout!.trim();
    return containerId.length > 0;
  } catch (e: any) {
    if (e.code === "ENOENT" || (e.stderr && e.stderr.includes("not found"))) {
      if (projectName) {
        return isServiceRunningInProject(projectName, serviceName);
      }
      return false;
    }
    throw e;
  }
}

export async function isRunningAny(workdir: string, composeFilePath: string, projectName?: string): Promise<boolean> {
  try {
    const { stdout } = await composeCmd(["ps", "-q"], workdir, composeFilePath, projectName);
    const containerIds = stdout!.trim().split("\n").filter(line => line.length > 0);
    return containerIds.length > 0;
  } catch (e: any) {
    if (e.code === "ENOENT" || (e.stderr && e.stderr.includes("not found"))) {
      return false;
    }
    throw e;
  }
}

export async function getServicePort(workdir: string, composeFilePath: string, serviceName: string, containerPort: number, projectName?: string): Promise<number> {
  const { stdout } = await composeCmd(["port", serviceName, String(containerPort)], workdir, composeFilePath, projectName);
  return parseInt(stdout!.trim(), 10);
}

export async function getServiceContainerId(
  workdir: string,
  composeFilePath: string,
  serviceName: string,
  projectName?: string
): Promise<string | null> {
  try {
    const { stdout } = await composeCmd(["ps", "-q", "-a", serviceName], workdir, composeFilePath, projectName);
    const id = stdout!.trim();
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
  const { stdout } = await composeCmd(["port", serviceName, String(containerPort)], workdir, composeFilePath, projectName);
  const text = stdout!.trim();
  
  if (!text) throw new Error("Service port not found");
  
  const parts = text.split(":");
  const portStr = parts[parts.length - 1];
  const port = parseInt(portStr, 10);
  
  if (isNaN(port)) throw new Error(`Invalid port format: ${text}`);
  
  return port;
}
