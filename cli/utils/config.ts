import { exists } from "@std/fs/exists";
import { parse } from "@std/toml";
import { join } from "@std/path";
import { deepMerge } from "@std/collections/deep-merge";

export interface CopyConfig {
  include: string[];
  exclude: string[];
  includeDirs: string[];
  excludeDirs: string[];
}

export interface RunConfig {
  copy: CopyConfig;
  env_vars: string[];
}

const DEFAULT_CONFIG: RunConfig = {
  copy: {
    include: [],
    exclude: [],
    includeDirs: [],
    excludeDirs: [],
  },
  env_vars: [],
};

const MERGE_OPTS = { arrays: "replace" as const };

export async function loadConfig(): Promise<RunConfig> {
  const cwd = Deno.cwd();
  const globalConfigPath = join(cwd, ".hyperbranch.config.toml");
  const localConfigPath = join(cwd, ".hyperbranch", "config.toml");

  let config = { ...DEFAULT_CONFIG };

  // Load local config (.hyperbranch/config.toml)
  if (await exists(localConfigPath)) {
    try {
      const content = await Deno.readTextFile(localConfigPath);
      const parsed = parse(content) as unknown as Partial<RunConfig>;
      config = deepMerge(config, parsed, MERGE_OPTS) as unknown as RunConfig;
    } catch (e) {
      console.warn(`Warning: Failed to parse ${localConfigPath}: ${e}`);
    }
  }

  // Load global config (.hyperbranch.config.toml) - Takes precedence
  if (await exists(globalConfigPath)) {
    try {
      const content = await Deno.readTextFile(globalConfigPath);
      const parsed = parse(content) as unknown as Partial<RunConfig>;
      config = deepMerge(config, parsed, MERGE_OPTS) as unknown as RunConfig;
    } catch (e) {
      console.warn(`Warning: Failed to parse ${globalConfigPath}: ${e}`);
    }
  }

  return config;
}
