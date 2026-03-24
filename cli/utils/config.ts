import { access, readFile } from "node:fs/promises";
import { parse } from "toml";
import { join } from "node:path";
import merge from "lodash.merge";

export interface RunConfig {
  env_vars: string[];
}

const DEFAULT_CONFIG: RunConfig = {
  env_vars: [],
};

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function loadConfig(): Promise<RunConfig> {
  const cwd = process.cwd();
  const globalConfigPath = join(cwd, ".hyperbranch.config.toml");
  const localConfigPath = join(cwd, ".hyperbranch", "config.toml");

  let config = { ...DEFAULT_CONFIG };

  // Load local config (.hyperbranch/config.toml)
  if (await exists(localConfigPath)) {
    try {
      const content = await readFile(localConfigPath, "utf-8");
      const parsed = parse(content) as unknown as Partial<RunConfig>;
      config = merge({}, config, parsed) as unknown as RunConfig;
      if (parsed.env_vars) config.env_vars = parsed.env_vars;
    } catch (e) {
      console.warn(`Warning: Failed to parse ${localConfigPath}: ${e}`);
    }
  }

  // Load global config (.hyperbranch.config.toml) - Takes precedence
  if (await exists(globalConfigPath)) {
    try {
      const content = await readFile(globalConfigPath, "utf-8");
      const parsed = parse(content) as unknown as Partial<RunConfig>;
      config = merge({}, config, parsed) as unknown as RunConfig;
      if (parsed.env_vars) config.env_vars = parsed.env_vars;
    } catch (e) {
      console.warn(`Warning: Failed to parse ${globalConfigPath}: ${e}`);
    }
  }

  return config;
}