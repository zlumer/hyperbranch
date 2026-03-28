import * as pty from 'node-pty';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chmod } from 'node:fs/promises';

export interface BwrapOptions {
  cwd?: string; // relative to workspace
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
  private hasExited = false;

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
    const targetCwd = options.cwd ? join(this.workspacePath, options.cwd) : this.workspacePath;
    const env = { ...process.env, ...options.env };
    
    if (options.withoutGit) {
      // create a fake git that fails
      const fakeBinDir = join(this.workspacePath, '.fake-bin');
      await mkdir(fakeBinDir, { recursive: true });
      const fakeGit = join(fakeBinDir, 'git');
      await writeFile(fakeGit, '#!/bin/sh\necho "git: command not found" >&2\nexit 127\n');
      await chmod(fakeGit, 0o755);
      env.PATH = `${fakeBinDir}:${env.PATH || ''}`;
    }

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
    const promptPath = join(this.workspacePath, 'mock-prompt.js');
    await writeFile(promptPath, mockPromptCode);
    let nodeOptions = env.NODE_OPTIONS || '';
    // on Windows we would need to be careful with paths, but we are on Linux
    nodeOptions = `${nodeOptions} --import ${promptPath}`.trim();

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
      const fetchPath = join(this.workspacePath, 'mock-fetch.js');
      await writeFile(fetchPath, mockCode);
      nodeOptions = `${nodeOptions} --import ${fetchPath}`.trim();
    }
    
    if (options.shareNet === false) {
      const noNetCode = `
        globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
      `;
      const noNetPath = join(this.workspacePath, 'no-net.js');
      await writeFile(noNetPath, noNetCode);
      nodeOptions = `${nodeOptions} --import ${noNetPath}`.trim();
    }

    if (nodeOptions) {
      env.NODE_OPTIONS = nodeOptions;
    }

    const distHb = join(process.cwd(), 'dist/hb.js');

    this.ptyProcess = pty.spawn(process.execPath, [distHb, ...args], {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: targetCwd,
      env: env as Record<string, string>,
    });

    this.ptyProcess.onData((data) => {
      this.output += data;
    });

    this.exitCodePromise = new Promise((resolve) => {
      this.ptyProcess!.onExit((e) => {
        this.hasExited = true;
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
      if (this.hasExited && !this.output.includes(expected)) {
        throw new Error(`Process exited before output "${expected}" was seen. Final output: ${this.output}`);
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
    
    let timeoutId: NodeJS.Timeout;
    const timeoutPromise = new Promise<number>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Timeout waiting for process to exit')), timeoutMs);
    });

    try {
      exitCode = await Promise.race([this.exitCodePromise, timeoutPromise]);
    } catch (e) {
      if (this.ptyProcess) this.ptyProcess.kill();
      throw e;
    } finally {
      clearTimeout(timeoutId!);
    }

    return {
      stdout: this.output,
      exitCode,
    };
  }
}
