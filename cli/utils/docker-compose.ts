import { parse, stringify } from '@std/yaml'
import { dockerCmd } from "./docker.ts"
import { DockerComposeSchema } from "./docker-compose.schema.ts"

export const DEFAULT_SERVICE_NAME = "hyperbranch-run"

export type Mounts = [host: string, container: string][]
export type Ports = [host: number, container: number][]

export function addDockerCacheMounts(compose: string, mounts: Mounts, serviceName = DEFAULT_SERVICE_NAME): string
{
	// parse compose yaml
	// if it has a build context, add mounts for common package manager caches to speed up builds
	// if it has a run context, add mounts for common package manager caches to speed up runs
	// return modified compose yaml

	const parsed = DockerComposeSchema.parse(parse(compose))
	const service = parsed.services?.[serviceName]
	if (!service)
		throw new Error(`Service '${serviceName}' not found in compose file`)

	if (service.build)
	{
		service.build.mounts = service.build.mounts || []
		for (const [host, container] of mounts)
		{
			const mountStr = `type=bind,source=${host},target=${container}`
			if (!service.build.mounts.includes(mountStr))
				service.build.mounts.push(mountStr)
		}
	}
	return stringify(parsed)
}

export function up(workdir: string, composeFilePath: string)
{
	const cmd = dockerCmd(["compose", "-f", composeFilePath, "up", "-d"], {
		cwd: workdir,
	})
	return cmd.output()
}
export function down(workdir: string, composeFilePath: string)
{
	const cmd = dockerCmd(["compose", "-f", composeFilePath, "down"], {
		cwd: workdir,
	})
	return cmd.output()
}
export function status(workdir: string, composeFilePath: string)
{
	const cmd = dockerCmd(["compose", "-f", composeFilePath, "ps"], {
		cwd: workdir,
	})
	return cmd.output()
}
export async function isRunningService(workdir: string, composeFilePath: string, serviceName = DEFAULT_SERVICE_NAME): Promise<boolean>
{
	const cmd = dockerCmd(["compose", "-f", composeFilePath, "ps", "-q", serviceName], {
		cwd: workdir,
	})
	const output = await cmd.output()
	const containerId = new TextDecoder().decode(output.stdout).trim()
	return containerId.length > 0
}
export async function isRunningAny(workdir: string, composeFilePath: string): Promise<boolean>
{
	const cmd = dockerCmd(["compose", "-f", composeFilePath, "ps", "-q"], {
		cwd: workdir,
	})
	const output = await cmd.output()
	const containerIds = new TextDecoder().decode(output.stdout).trim().split("\n").filter(line => line.length > 0)
	return containerIds.length > 0
}

export async function getServicePort(workdir: string, composeFilePath: string, serviceName: string, containerPort: number): Promise<number>
{
	const cmd = dockerCmd(["compose", "-f", composeFilePath, "port", serviceName, String(containerPort)], {
		cwd: workdir,
	})
	const output = await cmd.output()
	return parseInt(new TextDecoder().decode(output.stdout).trim(), 10)
}
