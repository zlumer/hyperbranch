import * as pty from 'node-pty';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export interface BwrapOptions {
  cwd?: string; // relative to /workspace
  mockFetch?: boolean;
  shareNet?: boolean;
  withoutGit?: boolean;
  env?: Record<string, string>;
}

export interface BwrapResult {
  stdout: string;
  exitCode: number;
}

export class BwrapRunner {
  public workspacePath!: string;
  private ptyProcess?: pty.IPty;
  private output = '';
  private exitCodePromise!: Promise<number>;

  async setup() {
    this.workspacePath = await mkdtemp(join(tmpdir(), 'hb-test-'));
  }

  async cleanup() {
    if (this.ptyProcess) {
      this.ptyProcess.kill();
    }
    await rm(this.workspacePath, { recursive: true, force: true });
  }

  async runCLI(args: string[], options: BwrapOptions = {}): Promise<void> {
    const bwrapArgs = [
      '--ro-bind', '/', '/',
      '--bind', this.workspacePath, '/workspace',
      '--unshare-all',
      '--dev', '/dev',
      '--proc', '/proc'
    ];

    if (options.shareNet !== false) {
      bwrapArgs.push('--share-net');
    }

    if (options.withoutGit) {
      bwrapArgs.push('--ro-bind', '/dev/null', '/usr/bin/git');
    }

    const targetCwd = options.cwd ? join('/workspace', options.cwd) : '/workspace';
    bwrapArgs.push('--chdir', targetCwd);

    const env = { ...process.env, ...options.env };
    
    // We need to pass required env vars like PATH for node to run correctly inside bwrap
    if (!env.PATH) env.PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';

    const mockPromptCode = `
      import fs from 'fs';
      import { execSync } from 'child_process';
      globalThis.prompt = (msg) => {
        process.stdout.write(msg);
        const buf = Buffer.alloc(1024);
        let bytes = 0;
        while (bytes === 0) {
          try {
            bytes = fs.readSync(0, buf, 0, 1024, null);
            if (bytes === 0) break;
          } catch (e) {
            if (e.code === 'EAGAIN') {
              execSync('sleep 0.05');
              continue;
            }
            break;
          }
        }
        return buf.toString('utf8', 0, bytes).trim();
      };
      globalThis.confirm = (msg) => {
        const p = globalThis.prompt(msg + ' (y/n) ');
        return p.toLowerCase() === 'y';
      };
    `;
    await writeFile(join(this.workspacePath, 'mock-prompt.js'), mockPromptCode);
    let nodeOptions = env.NODE_OPTIONS || '';
    nodeOptions = `${nodeOptions} --import /workspace/mock-prompt.js`.trim();

    if (options.mockFetch) {
      const mockCode = `
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async (url, options) => {
          if (url.includes('generativelanguage.googleapis.com')) {
            return new Response(JSON.stringify({
              candidates: [{ content: { parts: [{ text: "John" }] } }]
            }), { status: 200, headers: { 'Content-Type': 'application/json' }});
          }
          return originalFetch(url, options);
        };
      `;
      await writeFile(join(this.workspacePath, 'mock-fetch.js'), mockCode);
      nodeOptions = `${nodeOptions} --import /workspace/mock-fetch.js`.trim();
    }
    
    if (nodeOptions) {
      bwrapArgs.push('--setenv', 'NODE_OPTIONS', nodeOptions);
    }

    const distHb = join(process.cwd(), 'dist/hb.js');
    bwrapArgs.push('node', distHb, ...args);

    this.ptyProcess = pty.spawn('bwrap', bwrapArgs, {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: this.workspacePath,
      env: env as Record<string, string>,
    });

    this.ptyProcess.onData((data) => {
      this.output += data;
    });

    this.exitCodePromise = new Promise((resolve) => {
      this.ptyProcess!.onExit((e) => {
        const code = e.exitCode !== undefined ? e.exitCode : (e.signal ? 1 : 0);
        resolve(code);
      });
    });
  }

  async waitForOutput(expected: string, timeoutMs = 5000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (this.output.includes(expected)) {
        return;
      }
      await new Promise(r => setTimeout(r, 50));
    }
    throw new Error(`Timeout waiting for output: "${expected}". Current output: ${this.output}`);
  }

  write(data: string) {
    if (!this.ptyProcess) throw new Error('Process not started');
    this.ptyProcess.write(data);
  }

  async waitForExit(timeoutMs = 10000): Promise<BwrapResult> {
    const start = Date.now();
    let exitCode: number | undefined;
    
    const timeoutPromise = new Promise<number>((_, reject) => {
      setTimeout(() => reject(new Error('Timeout waiting for process to exit')), timeoutMs);
    });

    try {
      exitCode = await Promise.race([this.exitCodePromise, timeoutPromise]);
    } catch (e) {
      if (this.ptyProcess) this.ptyProcess.kill();
      throw e;
    }

    return {
      stdout: this.output,
      exitCode,
    };
  }
}
