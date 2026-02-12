import { assertEquals, assertStringIncludes } from "@std/assert";
import { assertSpyCalls, stub } from "@std/testing/mock";
import { join } from "@std/path";
import * as Docker from "./docker.ts";

Deno.test("runContainer - generates compose and runs docker", async () => {
  const tempDir = await Deno.makeTempDir();
  const runDir = join(tempDir, "run");
  await Deno.mkdir(runDir);
  
  // Mock Deno.Command
  // @ts-ignore: mocking Deno.Command
  const cmdStub = stub(Deno, "Command", (cmd: string, options: any) => {
    const args = options?.args || [];
    
    // Mock docker compose run
    if (cmd === "docker" && args[0] === "compose" && args[3] === "run") {
        return {
            output: () => Promise.resolve({ success: true, code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() }),
        } as any;
    }
    
    // Mock docker inspect
    if (cmd === "docker" && args[0] === "inspect") {
        return {
            output: () => Promise.resolve({ 
                success: true, 
                code: 0, 
                stdout: new TextEncoder().encode("mock-cid\n"), 
                stderr: new Uint8Array() 
            }),
        } as any;
    }

    return {
        output: () => Promise.resolve({ success: false, code: 1, stderr: new TextEncoder().encode("unknown command") }),
    } as any;
  });

  const config: Docker.DockerConfig = {
    image: "test-image",
    name: "test-project",
    exec: ["echo", "hello"],
    workdir: "/app",
    hostWorkdir: tempDir,
    runDir: runDir,
    mounts: ["-v /cache:/cache"],
    env: { FOO: "BAR" },
    user: "1000:1000",
  };

  try {
    let capturedCid = "";
    await Docker.runContainer(config, (cid) => {
      capturedCid = cid;
    });

    assertEquals(capturedCid, "mock-cid");

    // Verify .env
    const envContent = await Deno.readTextFile(join(runDir, ".env"));
    assertStringIncludes(envContent, "FOO=BAR");

    // Verify docker-compose.yml
    const composeContent = await Deno.readTextFile(join(runDir, "docker-compose.yml"));
    assertStringIncludes(composeContent, "image: test-image");
    assertStringIncludes(composeContent, "container_name: test-project");

    // Verify hb.cid file
    const cidFileContent = await Deno.readTextFile(join(runDir, "hb.cid"));
    assertEquals(cidFileContent, "mock-cid");

  } finally {
    cmdStub.restore();
    await Deno.remove(tempDir, { recursive: true });
  }
});
