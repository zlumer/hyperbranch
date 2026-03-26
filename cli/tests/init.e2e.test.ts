import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BwrapRunner } from './helpers/bwrap.js';
import { join } from 'node:path';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { execa } from 'execa';

describe('hb init e2e', () => {
  let runner: BwrapRunner;

  beforeEach(async () => {
    runner = new BwrapRunner();
    await runner.setup();
  });

  afterEach(async () => {
    await runner.cleanup();
  });

  const initGit = async (dir: string) => {
    await execa('git', ['init'], { cwd: dir });
    await execa('git', ['config', 'user.name', 'Test User'], { cwd: dir });
    await execa('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  };

  describe('Failures', () => {
    it('Git is not installed', async () => {
      await runner.runCLI(['init'], { withoutGit: true });
      const result = await runner.waitForExit(15000);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('Error: Git is not installed. Please install Git to use Hyperbranch.');
    }, 15000);

    it('Not in a git directory', async () => {
      // Empty workspace, no .git
      await runner.runCLI(['init']);
      const result = await runner.waitForExit(15000);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('Error: The current directory is not a git repository.');
    }, 15000);

    it('Running in git root, .hyperbranch already exists (Type n)', async () => {
      await initGit(runner.workspacePath);
      await mkdir(join(runner.workspacePath, '.hyperbranch'));
      
      await runner.runCLI(['init']);
      await runner.waitForOutput('.hyperbranch directory already exists. Do you want to proceed and potentially overwrite files?', 15000);
      runner.write('n\r');
      
      const result = await runner.waitForExit(15000);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Aborting init.');
    }, 15000);

    it('Running in git root, .hyperbranch already exists (Type y)', async () => {
      await initGit(runner.workspacePath);
      await mkdir(join(runner.workspacePath, '.hyperbranch'));
      
      await runner.runCLI(['init'], { mockFetch: true });
      await runner.waitForOutput('.hyperbranch directory already exists', 15000);
      runner.write('y\r');
      
      await runner.waitForOutput('GEMINI_KEY:', 15000);
      runner.write('mock-api-key\r');
      
      await runner.waitForOutput('Do you want to commit the Hyperbranch .gitignore to git?', 15000);
      runner.write('y\r');
      
      const result = await runner.waitForExit(15000);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Success! Hyperbranch is initialized.');
    }, 15000);

    it('API Key Validation Failure - proceed anyway', async () => {
      await initGit(runner.workspacePath);
      
      // No mockFetch here, so it hits the real API (which fails with invalid key) or we can just let it fail
      // We disable network to force an "unknown" validation result, which triggers the "Proceed anyway?" prompt
      await runner.runCLI(['init'], { mockFetch: false, shareNet: false });
      
      await runner.waitForOutput('GEMINI_KEY:', 15000);
      runner.write('invalid_key_123\r');
      
      await runner.waitForOutput('Proceed anyway?', 15000);
      runner.write('y\r');
      
      await runner.waitForOutput('Do you want to commit the Hyperbranch .gitignore to git?', 15000);
      runner.write('n\r'); // skip commit
      
      const result = await runner.waitForExit(15000);
      expect(result.exitCode).toBe(0);
    }, 30000);


    it('Running in a subdir of git root, .hyperbranch already exists in the same subdir', async () => {
      await initGit(runner.workspacePath);
      const subdir = join(runner.workspacePath, 'subdir');
      await mkdir(subdir);
      await mkdir(join(subdir, '.hyperbranch'));
      
      await runner.runCLI(['init'], { cwd: 'subdir' });
      await runner.waitForOutput('.hyperbranch directory already exists', 15000);
      runner.write('n\r');
      
      const result = await runner.waitForExit(15000);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Aborting init.');
    }, 15000);

    it('Running in a subdir of git root, .hyperbranch already exists in git root', async () => {
      await initGit(runner.workspacePath);
      await mkdir(join(runner.workspacePath, '.hyperbranch'));
      const subdir = join(runner.workspacePath, 'subdir');
      await mkdir(subdir);
      
      await runner.runCLI(['init'], { cwd: 'subdir' });
      await runner.waitForOutput('.hyperbranch directory already exists', 15000);
      runner.write('n\r');
      
      const result = await runner.waitForExit(15000);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Aborting init.');
    }, 15000);
  });

  describe('Successes', () => {
    it('Running in git root', async () => {
      await initGit(runner.workspacePath);
      
      await runner.runCLI(['init'], { mockFetch: true });
      
      await runner.waitForOutput('GEMINI_KEY:', 15000);
      runner.write('mock-api-key\r');
      
      await runner.waitForOutput('Do you want to commit the Hyperbranch .gitignore to git?', 15000);
      runner.write('y\r');
      
      const result = await runner.waitForExit(15000);
      expect(result.exitCode).toBe(0);
      
      // Verify files
      const gitignoreStat = await stat(join(runner.workspacePath, '.hyperbranch', '.gitignore'));
      expect(gitignoreStat.isFile()).toBe(true);
      const envRunStat = await stat(join(runner.workspacePath, '.hyperbranch', '.env.run'));
      expect(envRunStat.isFile()).toBe(true);
      
      // Verify commit
      const { stdout: gitLog } = await execa('git', ['log', '-1', '--oneline'], { cwd: runner.workspacePath });
      expect(gitLog).toMatch(/chore: added task Initial hyperbranch setup|Initialize Hyperbranch/);
    }, 15000);

    it('Running in a subdir of git root', async () => {
      await initGit(runner.workspacePath);
      const subdir = join(runner.workspacePath, 'subdir');
      await mkdir(subdir);
      
      // Note: we pass cwd: 'subdir' which makes bwrap chdir to /workspace/subdir
      await runner.runCLI(['init'], { cwd: 'subdir', mockFetch: true });
      
      await runner.waitForOutput('GEMINI_KEY:', 15000);
      runner.write('mock-api-key\r');
      
      await runner.waitForOutput('Do you want to commit the Hyperbranch .gitignore to git?', 15000);
      runner.write('y\r');
      
      const result = await runner.waitForExit(15000);
      expect(result.exitCode).toBe(0);
      
      // Verify files in root, NOT subdir
      const gitignoreStat = await stat(join(runner.workspacePath, '.hyperbranch', '.gitignore'));
      expect(gitignoreStat.isFile()).toBe(true);
    }, 15000);

    it('User doesn\'t agree to commit', async () => {
      await initGit(runner.workspacePath);
      
      await runner.runCLI(['init'], { mockFetch: true });
      
      await runner.waitForOutput('GEMINI_KEY:', 15000);
      runner.write('mock-api-key\r');
      
      await runner.waitForOutput('Do you want to commit the Hyperbranch .gitignore to git?', 15000);
      runner.write('n\r');
      
      const result = await runner.waitForExit(15000);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Initialization files were not committed');
      
      // Verify status untracked
      const { stdout: gitStatus } = await execa('git', ['status', '--porcelain'], { cwd: runner.workspacePath });
      expect(gitStatus).toContain('?? .hyperbranch/');
    }, 15000);
  });
});
