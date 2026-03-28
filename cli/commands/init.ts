import fs from "node:fs/promises";
import { join } from "node:path";
import { create as createTask } from "../services/tasks.js";
import { command } from "cmd-ts";
import { isGitRepository, getRootGitDir } from "../utils/git.js";
import * as git from "../utils/git.js"
import { RUNS_DIR, TASKS_DIR } from "../utils/paths.js";
import { confirm, prompt } from "@deno/shim-prompts";

const GITIGNORE_CONTENTS = `.env
.env.*
.runs
.current-run
`

const ENV_RUN_CONTENTS = (apiKey: string) => `GOOGLE_GENERATIVE_AI_API_KEY=${apiKey}
GEMINI_API_KEY=${apiKey}
AIDER_MODEL="gemini/gemini-3.1-pro-preview"
AIDER_WEAK_MODEL="gemini/gemini-3-flash-preview"
`

const TASK_TEXT = `explore the current codebase with a subagent and find out how tasks are tracked (beans, backlog.md, todo list, todo comments)
read https://github.com/zlumer/hyperbranch and learn how to use \`hb\` cli
move all existing tasks that are not yet marked as done to the \`hb\` task tracking`

async function exists(path: string) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function validateGoogleApiKey(apiKey: string): Promise<"valid" | "invalid" | "unknown"> {
  let retries = 3
  while (retries > 0) {
    try {
      const model = "gemini-3.1-flash-lite-preview"
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "what is the first name of John Smith? REPLY WITH ONLY THE FIRST NAME, NOTHING ELSE" }] }]
        })
      })

      if (!response.ok) {
        if (response.status === 400 || response.status === 401 || response.status === 403) {
          return "invalid"
        }
        retries--
        if (retries === 0) return "unknown"
        await new Promise(resolve => setTimeout(resolve, 1000))
        continue
      }

      const data = await response.json() as any
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ""
      
      if (!text.toLowerCase().includes("john")) {
        console.warn(`Warning: Unexpected response from Gemini API: ${text}`)
        return "valid" // still valid structurally even if it didn't return what we wanted
      }
      
      return "valid"
    } catch (e) {
      retries--
      if (retries === 0) return "unknown"
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
  return "unknown"
}

export const initCmd = command({
  name: "init",
  description: "Initialize hyperbranch",
  args: {},
  handler: async () => {
    if (!(await isGitRepository())) {
      console.error("Error: Git is not installed or the current directory is not a git repository.")
      process.exit(1)
    }

    const originalCwd = process.env.HB_ORIGINAL_CWD || process.cwd()
    const gitRoot = await getRootGitDir()
    
    if (gitRoot && gitRoot !== originalCwd) {
      if (await exists(join(originalCwd, ".hyperbranch"))) {
        const shouldProceed = confirm(".hyperbranch directory already exists. Do you want to proceed and potentially overwrite files?")
        if (!shouldProceed) {
          console.log("Aborting init.")
          process.exit(0)
        }
      }
      console.warn(`Warning: The current directory is not the git root. Proceeding with the root directory: ${gitRoot}`)
    }

    const hyperbranchDir = join(process.cwd(), ".hyperbranch")
    if (await exists(hyperbranchDir)) {
      const shouldProceed = confirm(".hyperbranch directory already exists. Do you want to proceed and potentially overwrite files?")
      if (!shouldProceed) {
        console.log("Aborting init.")
        process.exit(0)
      }
    }

    console.log("Please provide your Google Gemini API key.")
    console.log("You can get one here: https://aistudio.google.com/app/apikey")
    let apiKey = ""
    while (true) {
      apiKey = prompt("GEMINI_KEY:") || ""
      if (!apiKey.trim()) {
        console.error("API key is required.")
        continue
      }

      console.log("Validating API key...")
      const validationResult = await validateGoogleApiKey(apiKey)
      
      if (validationResult === "invalid") {
        console.error("Error: Invalid API key.")
        console.log("Please check your API key and try again.")
        continue
      } else if (validationResult === "unknown") {
        console.error("Failed to connect to the Gemini API or received unexpected error.")
        const proceed = confirm("Could not validate API key. Proceed anyway?")
        if (!proceed) continue
      } else {
        console.log("API key validated successfully.")
      }
      break
    }

    await fs.mkdir(TASKS_DIR(hyperbranchDir), { recursive: true })
    await fs.mkdir(RUNS_DIR(hyperbranchDir), { recursive: true })

    await fs.writeFile(join(hyperbranchDir, ".gitignore"), GITIGNORE_CONTENTS)
    await fs.writeFile(join(hyperbranchDir, ".env.run"), ENV_RUN_CONTENTS(apiKey))

	const shouldCommit = confirm("Do you want to commit the Hyperbranch .gitignore to git?")
	if (shouldCommit) {
		await git.add([join(".hyperbranch", ".gitignore")])
		const commitMessage = "Initialize Hyperbranch with .hyperbranch directory, .gitignore, and .env.run"
		await git.commit(commitMessage, [join(".hyperbranch", ".gitignore")])
		console.log("Initialization files committed to git.")
	} else {
		console.log("Initialization files were not committed. You can commit them manually later.")
	}

    console.log("Creating test task...")
    
    try {
      const task = await createTask("Initial hyperbranch setup", undefined, TASK_TEXT, "todo")
      console.log(`Test task created: ${task.id}`)
    } catch (e) {
      console.error("Failed to create test task:", e)
    }

    console.log("\nSuccess! Hyperbranch is initialized.")
    console.log("To view your tasks, start the web interface:")
    console.log("  hb web")
    process.exit(0)
  }
});
