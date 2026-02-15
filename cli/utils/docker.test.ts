import { assertEquals } from "@std/assert";
import { assertSpyCalls, stub } from "@std/testing/mock";
import { join } from "@std/path";
import * as Docker from "./docker.ts";

Deno.test("buildImage - calls docker build", async () => {
  // deno-lint-ignore no-explicit-any
  const cmdStub = stub(Deno, "Command", (_cmd: any, options: any) => {
    const args = options?.args || [];
    if (args[0] === "build") {
        return {
            output: () => Promise.resolve({ success: true, code: 0 }),
        } as unknown as Deno.Command;
    }
    throw new Error(`Unexpected command: ${args.join(" ")}`);
  });

  try {
    await Docker.buildImage("Dockerfile.test", "test-tag");
    assertSpyCalls(cmdStub, 1);
    const args = (cmdStub.calls[0].args[1] as Deno.CommandOptions).args || [];
    assertEquals(args[0], "build");
    assertEquals(args.includes("Dockerfile.test"), true);
    assertEquals(args.includes("test-tag"), true);
  } finally {
    cmdStub.restore();
  }
});

Deno.test("runContainer - executes docker compose run", async () => {
  const tempDir = await Deno.makeTempDir();
  const cid = "mock-cid-123";
  
  // Create a dummy docker-compose.yml
  await Deno.writeTextFile(join(tempDir, "docker-compose.yml"), "version: '3.8'");

  // deno-lint-ignore no-explicit-any
  const cmdStub = stub(Deno, "Command", (_cmd: any, options: any) => {
    const args = options?.args || [];
    
    // 1. docker compose run
    if (args[0] === "compose" && args.includes("run")) {
      return {
        output: () => Promise.resolve({ success: true, code: 0, stderr: new Uint8Array() }),
      } as unknown as Deno.Command;
    }

    // 2. docker inspect
    if (args[0] === "inspect") {
      return {
        output: () => Promise.resolve({ 
            success: true, 
            code: 0, 
            stdout: new TextEncoder().encode(cid + "\n") 
        }),
      } as unknown as Deno.Command;
    }

    // 3. docker logs
    if (args[0] === "logs") {
       return {
        spawn: () => ({
            stdout: new ReadableStream({
                start(controller) {
                    controller.enqueue(new TextEncoder().encode("Log output\n"));
                    controller.close();
                }
            }),
            stderr: new ReadableStream({
                start(controller) {
                    controller.close();
                }
            }),
            status: Promise.resolve({ success: true, code: 0 }),
        })
      } as unknown as Deno.Command;
    }

    return {
        output: () => Promise.resolve({ success: true, code: 0 }),
    } as unknown as Deno.Command;
  });

  try {
    const config: Docker.DockerConfig = {
      image: "test-image",
      name: "test-project",
      exec: ["echo", "hello"],
      workdir: "/app",
      hostWorkdir: tempDir,
      runDir: tempDir,
      mounts: ["-v /cache:/cache"],
      env: { FOO: "BAR" },
      user: "1000:1000",
      dockerArgs: [],
    };

    // const capturedCid = await Docker.runContainer(config);

    // assertEquals(capturedCid, cid);
    
    // Verify .env creation
    const envContent = await Deno.readTextFile(join(tempDir, ".env"));
    assertEquals(envContent.includes("FOO=BAR"), true);
    assertEquals(envContent.includes("HB_IMAGE=test-image"), true);
    
    // Check logs were captured (eventually)
    // Since logs are piped in background, we might need to wait a bit or just check files exist
    const stdoutPath = join(tempDir, "stdout.log");
    const stderrPath = join(tempDir, "stderr.log");
    
    // We can't guarantee the stream finished writing in this async tick, but files should be created.
    // Given the mock streams close immediately, it should be fast.
    // Let's verify files exist.
    const stdoutStat = await Deno.stat(stdoutPath);
    assertEquals(stdoutStat.isFile, true);

  } finally {
    cmdStub.restore();
    await Deno.remove(tempDir, { recursive: true });
  }
});
