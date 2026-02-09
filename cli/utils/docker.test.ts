import { assertEquals, assertRejects } from "@std/assert";
import { assertSpyCalls, Spy, stub } from "@std/testing/mock";
import { join } from "@std/path";
import { ensureDir } from "@std/fs/ensure-dir";
import * as Docker from "./docker.ts";

// Mock Deno.Command spawn for shell execution
function mockShellRun(
  expectedArgs: string[],
  envChecks: Record<string, string>,
  output: { stdout: string; stderr: string; code: number },
) {
  // @ts-ignore: Stubbing Deno.Command
  return stub(
    Deno,
    "Command",
    // deno-lint-ignore no-explicit-any
    (cmd: any, options?: any) => {
      const args = options?.args || [];

      // Update to match: sh -c "nohup ./run.sh ... &"
      if (cmd === "sh" && args[0] === "-c" && args[1].includes("run.sh")) {
        // Verify environment variables
        if (options?.env) {
          for (const [k, v] of Object.entries(envChecks)) {
            if (options.env[k] !== v) {
              throw new Error(
                `Env mismatch for ${k}. Expected ${v}, got ${options.env[k]}`,
              );
            }
          }
        }

        // Simulate side effects (CID + logs)
        if (options?.cwd) {
          Deno.writeTextFileSync(join(options.cwd, "hb.cid"), "mock-cid-script");
          Deno.writeTextFileSync(join(options.cwd, "stdout.log"), output.stdout);
          Deno.writeTextFileSync(join(options.cwd, "stderr.log"), output.stderr);
        }

        // Return a mock process that exits immediately (simulating the 'nohup &')
        return {
          spawn: () => ({
            stdout: null, // Output redirected to files
            stderr: null,
            status: Promise.resolve({ success: true, code: 0 }),
            output: () => Promise.resolve({ success: true, code: 0 }),
            kill: () => {},
            ref: () => {},
            unref: () => {},
          }),
        } as unknown as Deno.Command;
      }

      // Fallback for docker build etc
      return {
        output: () => Promise.resolve({ success: true, code: 0 }),
      } as unknown as Deno.Command;
    },
  );
}

Deno.test("buildImage - calls docker build", async () => {
  // deno-lint-ignore no-explicit-any
  const cmdStub = stub(Deno, "Command", (cmd: any, opts: any) => {
    return {
      output: () => Promise.resolve({ success: true, code: 0 }),
    } as unknown as Deno.Command;
  });

  try {
    await Docker.buildImage("Dockerfile.test", "test-tag");
    assertSpyCalls(cmdStub, 1);
    const args = (cmdStub.calls[0].args[1] as Deno.CommandOptions).args || [];
    assertEquals(args, [
      "build",
      "-f",
      "Dockerfile.test",
      "-t",
      "test-tag",
      ".",
    ]);
  } finally {
    cmdStub.restore();
  }
});

Deno.test("runContainer - executes bash run.sh with envs", async () => {
  const tempDir = await Deno.makeTempDir();
  const cmdStub = mockShellRun(
    ["run.sh"],
    {
      HB_IMAGE: "test-image",
      HB_USER: "1000:1000",
    },
    { stdout: "Script Output", stderr: "", code: 0 },
  );

    const config: Docker.DockerConfig = {
    image: "test-image",
    exec: ["echo", "hello"],
    workdir: "/app",
    hostWorkdir: tempDir,
    runDir: tempDir,
    mounts: ["-v /cache:/cache"],
    env: { FOO: "BAR" },
    user: "1000:1000",
    dockerArgs: ["--network", "host"],
  };


  try {
    let capturedCid = "";
    await Docker.runContainer(config, tempDir, (cid) => {
      capturedCid = cid;
    });

    assertEquals(capturedCid, "mock-cid-script");

    const stdout = await Deno.readTextFile(join(tempDir, "stdout.log"));
    assertEquals(stdout, "Script Output");
  } finally {
    cmdStub.restore();
    await Deno.remove(tempDir, { recursive: true });
  }
});
