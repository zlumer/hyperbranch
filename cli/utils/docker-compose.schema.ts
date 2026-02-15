import { z } from "zod"

export const DockerComposeSchema = z.object({
	version: z.string(),
	services: z.record(z.string(), z.object({
		build: z.object({
			context: z.string(),
			dockerfile: z.string(),
			mounts: z.array(z.string()).optional(),
		}).optional(),

		image: z.string().optional(),
		ports: z.array(z.string()).optional(),
		environment: z.record(z.string(), z.string()).optional(),
	}))
})

export type DockerComposeConfig = z.infer<typeof DockerComposeSchema>