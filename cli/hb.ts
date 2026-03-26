#!/usr/bin/env -S npx -y tsx
import fs from "node:fs/promises";
import { HYPERBRANCH_DIR, RUNS_DIR, TASKS_DIR, TASKS_DIR_NAME } from "./utils/paths.ts";
import { subcommands, run } from "cmd-ts";

import { createCmd } from "./commands/create.ts";
import { connectCmd } from "./commands/connect.ts";
import { moveCmd } from "./commands/move.ts";
import { runCmd } from "./commands/run.ts";
import { logsCmd } from "./commands/logs.ts";
import { stopCmd } from "./commands/stop.ts";
import { psCmd } from "./commands/ps.ts";
import { rmCmd } from "./commands/rm.ts";
import { serverCmd } from "./commands/server.ts";
import { portCmd } from "./commands/port.ts";
import { mergeCmd } from "./commands/merge.ts";
import { syncCmd } from "./commands/sync.ts";
import { initCmd } from "./commands/init.ts";
import path from "node:path";
import { getRootGitDir, hasGitBinary, isGitRepository } from "./utils/git.js";

// --- Utils ---

function isSubDir(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function getParentDir(dir: string): string | undefined {
	const parentDir = path.dirname(dir);
	if (parentDir === dir)
		return undefined

	return parentDir
}
async function isDirectory(path: string): Promise<boolean> {
	return fs.stat(path)
		.then(stat => stat.isDirectory())
		.catch(() => false);
}

async function getWorkingDir(gitRoot: string)
{
	let currentDir = process.cwd()
	while (isSubDir(currentDir, gitRoot)) {
		const files = await fs.readdir(currentDir);
		if (files.includes(HYPERBRANCH_DIR))
			if (await isDirectory(path.join(currentDir, HYPERBRANCH_DIR)))
				return currentDir;
		
		const parentDir = getParentDir(currentDir);
		if (!parentDir)
			return gitRoot

		currentDir = parentDir;
	}
	return gitRoot
}

async function requireHbInitialized(workingDir: string) {
	const hbDirs = [TASKS_DIR(workingDir), RUNS_DIR(workingDir)];
	const hbDir = path.join(workingDir, HYPERBRANCH_DIR);
	try {
		const stat = await fs.stat(hbDir);
		if (!stat.isDirectory()) {
			throw new Error(`Expected ${hbDir} to be a directory`);
		}
		for (const dir of hbDirs) {
			await fs.mkdir(dir, { recursive: true })
		}
	} catch (e) {
		console.error("Error: Hyperbranch is not initialized in this repository.");
		console.error("Please run `hb init` to initialize Hyperbranch.");
		process.exit(1);
	}
}

async function requireGitRepo() {
	if (!(await hasGitBinary())) {
		console.error("Error: Git is not installed. Please install Git to use Hyperbranch.");
		process.exit(1);
	}

	if (!(await isGitRepository())) {
		console.error("Error: The current directory is not a git repository.");
		process.exit(1);
	}
	
	const gitRoot = await getRootGitDir();
	if (!gitRoot) {
		console.error("Error: The current directory is not a git repository.");
		process.exit(1);
	}

	return gitRoot;
}
// --- Main ---

const app = subcommands({
  name: 'hb',
  description: 'Hyperbranch CLI Scaffolding',
  cmds: {
    create: createCmd,
    connect: connectCmd,
    move: moveCmd,
    run: runCmd,
    logs: logsCmd,
    stop: stopCmd,
    ps: psCmd,
    rm: rmCmd,
    server: serverCmd,
    web: serverCmd,
    port: portCmd,
    merge: mergeCmd,
    sync: syncCmd,
    init: initCmd,
  }
});

async function main() {
  const gitRoot = await requireGitRepo()
  const workingDir = await getWorkingDir(gitRoot)

  const isInit = process.argv.slice(2)[0] === 'init';
  if (!isInit) {
	await requireHbInitialized(workingDir);
  }

  // save original cwd for commands that need to know where they were run from
  process.env.HB_ORIGINAL_CWD = process.cwd();

  // change cwd to git root to ensure consistent behavior
  process.chdir(gitRoot)
  run(app, process.argv.slice(2));
}

if (import.meta.url.startsWith("file:")) {
  main();
}

