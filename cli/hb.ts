#!/usr/bin/env tsx
import fs from "node:fs/promises";
import { TASKS_DIR } from "./utils/paths.ts";
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

// --- File I/O ---

async function ensureRepo() {
  await fs.mkdir(TASKS_DIR(), { recursive: true }).catch((e: any) => {
    if (e.code !== 'EEXIST') throw e;
  });
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
  const isInit = process.argv.slice(2)[0] === 'init';
  if (!isInit) {
    await ensureRepo();
  }
  run(app, process.argv.slice(2));
}

if (import.meta.url.startsWith("file:")) {
  main();
}
