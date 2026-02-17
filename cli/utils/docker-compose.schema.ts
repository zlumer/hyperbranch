import { z } from "zod"

export const DockerComposeSchema = z.object({
	version: z.string(),
	services: z.record(z.string(), z.object({
		build: z.object({
			context: z.string(),
			dockerfile: z.string(),
		}).optional(),

		image: z.string().optional(),
		ports: z.array(z.string()).optional(),
		environment: z.record(z.string(), z.string()).optional(),

		command: z.array(z.string()).optional(),
		env_file: z.string().optional(),
		volumes: z.array(z.object({
			type: z.string(),
			source: z.string(),
			target: z.string(),
		})).optional(),
	}))
})

export type DockerComposeConfig = z.infer<typeof DockerComposeSchema>